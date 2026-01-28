import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { saleDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { generateCode } from '@/lib/utils'
import { updateAccountBalance } from '@/lib/account-service'
import { getTaiwanTime } from '@/lib/timezone'

// GET /api/sales - List sales with items summary
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const createdFrom = searchParams.get('created_from') // 用於日結：從某時間點之後創建的訂單
    const createdTo = searchParams.get('created_to') // 用於營業日報表：到某時間點之前創建的訂單
    const customerCode = searchParams.get('customer_code')
    const source = searchParams.get('source')
    const keyword = searchParams.get('keyword')
    const productKeyword = searchParams.get('product_keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50') // Default to 50 for better performance
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : null

    // Build count query first for pagination
    let countQuery = (supabaseServer
      .from('sales') as any)
      .select('id', { count: 'exact', head: true })

    let query = (supabaseServer
      .from('sales') as any)
      .select(`
        id,
        sale_no,
        customer_code,
        sale_date,
        source,
        payment_method,
        is_paid,
        note,
        total,
        status,
        fulfillment_status,
        created_at,
        discount_type,
        discount_value,
        customers:customer_code (
          customer_name
        ),
        sale_items (
          id,
          quantity,
          price,
          snapshot_name,
          product_id,
          products (
            item_code,
            unit
          )
        )
      `)
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (dateFrom) {
      query = query.gte('sale_date', dateFrom)
      countQuery = countQuery.gte('sale_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('sale_date', dateTo)
      countQuery = countQuery.lte('sale_date', dateTo)
    }

    if (createdFrom) {
      // 使用 gt (大於) 避免邊界重複，日結時間點的訂單已經在上一個營業日中
      query = query.gt('created_at', createdFrom)
      countQuery = countQuery.gt('created_at', createdFrom)
    }

    if (createdTo) {
      query = query.lte('created_at', createdTo)
      countQuery = countQuery.lte('created_at', createdTo)
    }

    if (customerCode) {
      query = query.eq('customer_code', customerCode)
      countQuery = countQuery.eq('customer_code', customerCode)
    }

    if (source) {
      query = query.eq('source', source)
      countQuery = countQuery.eq('source', source)
    }

    // Search by keyword in sale_no, customer_code, or customer_name
    if (keyword) {
      // First find customer codes that match the keyword
      const { data: matchingCustomers } = await (supabaseServer
        .from('customers') as any)
        .select('customer_code')
        .ilike('customer_name', `%${keyword}%`)

      const matchingCodes = matchingCustomers?.map((c: any) => c.customer_code) || []

      // Build the search query
      if (matchingCodes.length > 0) {
        query = query.or(`sale_no.ilike.%${keyword}%,customer_code.in.(${matchingCodes.join(',')})`)
        countQuery = countQuery.or(`sale_no.ilike.%${keyword}%,customer_code.in.(${matchingCodes.join(',')})`)
      } else {
        query = query.ilike('sale_no', `%${keyword}%`)
        countQuery = countQuery.ilike('sale_no', `%${keyword}%`)
      }
    }

    // Apply pagination
    if (limit) {
      query = query.limit(limit)
    } else {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)
    }

    // 並行執行 count 和主查詢
    const [countResult, queryResult] = await Promise.all([
      countQuery,
      query
    ])

    const totalCount = countResult.count
    const { data, error } = queryResult

    if (error) {
      console.error('[Sales API] Query error:', {
        error: error.message,
        params: {
          dateFrom,
          dateTo,
          createdFrom,
          createdTo,
          source,
          customerCode,
          keyword,
          productKeyword
        }
      })
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    // Filter by product if needed
    let filteredData = data
    if (productKeyword) {
      filteredData = data?.filter((sale: any) => {
        const items = sale.sale_items || []
        return items.some((item: any) =>
          item.snapshot_name?.toLowerCase().includes(productKeyword.toLowerCase()) ||
          item.products?.item_code?.toLowerCase().includes(productKeyword.toLowerCase())
        )
      })
    }

    // Get delivery status for all sale_items - 單次查詢取代分批迴圈
    const allSaleItemIds = filteredData?.flatMap((sale: any) =>
      sale.sale_items?.map((item: any) => item.id) || []
    ) || []

    const deliveryQuantityMap: { [key: string]: number } = {}

    if (allSaleItemIds.length > 0) {
      // 分批查詢避免 URL 過長（每批最多 100 個 ID），並行執行
      const BATCH_SIZE = 100
      const batches: string[][] = []

      for (let i = 0; i < allSaleItemIds.length; i += BATCH_SIZE) {
        batches.push(allSaleItemIds.slice(i, i + BATCH_SIZE))
      }

      // 並行執行所有批次查詢
      const batchResults = await Promise.all(
        batches.map(batchIds =>
          (supabaseServer
            .from('delivery_items') as any)
            .select(`
              sale_item_id,
              quantity,
              deliveries!inner (
                status
              )
            `)
            .in('sale_item_id', batchIds)
            .eq('deliveries.status', 'confirmed')
        )
      )

      // 合併所有結果
      const allDeliveryItems = batchResults.flatMap(result => result.data || [])

      // 計算每個 sale_item 已出貨的數量
      allDeliveryItems.forEach((di: any) => {
        const currentQty = deliveryQuantityMap[di.sale_item_id] || 0
        deliveryQuantityMap[di.sale_item_id] = currentQty + di.quantity
      })
    }

    // Calculate summary for each sale and add delivery status to items
    const salesWithSummary = filteredData?.map((sale: any) => {
      const items = sale.sale_items || []
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      const avgPrice = items.length > 0
        ? items.reduce((sum: number, item: any) => sum + item.price, 0) / items.length
        : 0

      // Add delivery status and quantity to each item
      const itemsWithDeliveryStatus = items.map((item: any) => {
        const deliveredQty = deliveryQuantityMap[item.id] || 0
        return {
          ...item,
          delivered_quantity: deliveredQty,
          is_delivered: deliveredQty >= item.quantity
        }
      })

      return {
        ...sale,
        item_count: items.length,
        total_quantity: totalQuantity,
        avg_price: avgPrice,
        sale_items: itemsWithDeliveryStatus
      }
    })

    return NextResponse.json({
      ok: true,
      data: salesWithSummary,
      pagination: {
        page,
        pageSize,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / pageSize)
      }
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/sales - Create sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { is_delivered = true, delivery_method, expected_delivery_date, delivery_note, ...saleData } = body

    // Validate input
    const validation = saleDraftSchema.safeParse(saleData)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const draft = validation.data
    const pointProgramId = body.point_program_id || null

    // sale_no 由資料庫 sequence 自動生成

    // Determine primary account
    // Priority: 1) draft.account_id, 2) payments[].account_id, 3) lookup by payment_method
    let primaryAccountId = draft.account_id || null

    if (!primaryAccountId && draft.payments && draft.payments.length > 0) {
      // Find payment with largest amount
      const largest = draft.payments.reduce((max: any, p: any) => p.amount > max.amount ? p : max, draft.payments[0])
      primaryAccountId = largest.account_id || null
    }

    // Fallback: lookup account by payment_method (backward compatibility)
    if (!primaryAccountId && draft.payment_method && draft.payment_method !== 'pending') {
      const { data: account } = await (supabaseServer
        .from('accounts') as any)
        .select('id')
        .eq('account_name', draft.payment_method)
        .eq('is_active', true)
        .single()

      if (!account) {
        // Try legacy payment_method_code lookup
        const { data: legacyAccount } = await (supabaseServer
          .from('accounts') as any)
          .select('id')
          .eq('payment_method_code', draft.payment_method)
          .eq('is_active', true)
          .single()

        primaryAccountId = legacyAccount?.id || null
      } else {
        primaryAccountId = account.id
      }
    }

    const accountId = primaryAccountId

    // 取得台灣時間 (UTC+8)
    const now = new Date()
    const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const createdAt = taiwanTime.toISOString() // 完整的台灣時間戳記

    // 直接使用當前台灣日期作為 sale_date（營業日）
    // 修正：之前的邏輯是「日結日期+1天」，這會導致15號日結後，15號的銷售變成16號
    // 正確做法：使用銷售當下的台灣日期
    const saleDate = taiwanTime.toISOString().split('T')[0]

    // Start transaction-like operations
    // 1. Create sale (draft)
    const { data: sale, error: saleError } = await (supabaseServer
      .from('sales') as any)
      .insert({
        // sale_no 由資料庫自動生成
        customer_code: draft.customer_code || null,
        sale_date: saleDate, // 設定台灣時間的日期
        source: draft.source,
        payment_method: draft.payment_method,
        account_id: accountId,
        is_paid: draft.is_paid,
        note: draft.note || null,
        discount_type: draft.discount_type || 'none',
        discount_value: draft.discount_value || 0,
        status: 'draft',
        total: 0,
        fulfillment_status: 'none', // 初始為未履約
        delivery_method: delivery_method || null,
        expected_delivery_date: expected_delivery_date || null,
        delivery_note: delivery_note || null,
        point_program_id: pointProgramId, // 點數計劃
        points_earned: 0, // 稍後計算
        point_cost_estimated: 0, // 稍後計算
        created_at: createdAt, // 手動設定為台灣時間
      })
      .select()
      .single()

    if (saleError) {
      return NextResponse.json(
        { ok: false, error: saleError.message },
        { status: 500 }
      )
    }

    // 2. Check stock availability for each item
    for (const item of draft.items) {
      // 如果是從一番賞售出，檢查一番賞庫存
      if (item.ichiban_kuji_prize_id) {
        const { data: prize } = await (supabaseServer
          .from('ichiban_kuji_prizes') as any)
          .select('remaining, prize_tier')
          .eq('id', item.ichiban_kuji_prize_id)
          .single()

        if (!prize) {
          // Rollback: delete the sale
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: `Prize not found: ${item.ichiban_kuji_prize_id}` },
            { status: 400 }
          )
        }

        if (prize.remaining < item.quantity) {
          // Rollback: delete the sale
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            {
              ok: false,
              error: `${prize.prize_tier} 庫存不足。剩餘: ${prize.remaining}, 需要: ${item.quantity}`,
            },
            { status: 400 }
          )
        }
      } else {
        // 一般商品，檢查商品庫存
        const { data: product } = await (supabaseServer
          .from('products') as any)
          .select('stock, allow_negative, name')
          .eq('id', item.product_id)
          .single()

        if (!product) {
          // Rollback: delete the sale
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: `Product not found: ${item.product_id}` },
            { status: 400 }
          )
        }

        if (!product.allow_negative && product.stock < item.quantity) {
          // Rollback: delete the sale
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            {
              ok: false,
              error: `${product.name} 庫存不足。剩餘: ${product.stock}, 需要: ${item.quantity}`,
            },
            { status: 400 }
          )
        }
      }
    }

    // 3. Get product details and insert sale items (subtotal is auto-calculated by database)
    const saleItems = await Promise.all(
      draft.items.map(async (item) => {
        const { data: product } = await (supabaseServer
          .from('products') as any)
          .select('name, cost, avg_cost')
          .eq('id', item.product_id)
          .single()

        return {
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          cost: product?.avg_cost || product?.cost || 0,  // 優先使用加權平均成本
          snapshot_name: product?.name || null,
          ichiban_kuji_prize_id: item.ichiban_kuji_prize_id || null,
          ichiban_kuji_id: item.ichiban_kuji_id || null,
        }
      })
    )

    const { data: insertedSaleItems, error: itemsError } = await (supabaseServer
      .from('sale_items') as any)
      .insert(saleItems)
      .select()

    if (itemsError) {
      // Rollback: delete the sale
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      )
    }

    // 4. Calculate total with discount
    const subtotal = draft.items.reduce((sum, item) => sum + (item.quantity * item.price), 0)

    let discountAmount = 0
    if (draft.discount_type === 'percent') {
      discountAmount = (subtotal * (draft.discount_value || 0)) / 100
    } else if (draft.discount_type === 'amount') {
      discountAmount = draft.discount_value || 0
    }

    const total = Math.max(0, subtotal - discountAmount)

    // 5. Deduct ONLY ichiban kuji remaining (product stock is auto-deducted by DB trigger)
    for (const item of draft.items) {
      // 如果是從一番賞售出，扣除一番賞的 remaining
      if (item.ichiban_kuji_prize_id) {
        const { data: prize, error: fetchPrizeError } = await (supabaseServer
          .from('ichiban_kuji_prizes') as any)
          .select('remaining')
          .eq('id', item.ichiban_kuji_prize_id)
          .single()

        if (fetchPrizeError) {
          // Rollback: delete items and sale
          await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: `Failed to fetch prize: ${fetchPrizeError.message}` },
            { status: 500 }
          )
        }

        // 檢查一番賞庫存
        if (prize.remaining < item.quantity) {
          // Rollback: delete items and sale
          await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: `該賞已售完或庫存不足` },
            { status: 400 }
          )
        }

        // 扣除一番賞庫的 remaining
        const { error: updatePrizeError } = await (supabaseServer
          .from('ichiban_kuji_prizes') as any)
          .update({ remaining: prize.remaining - item.quantity })
          .eq('id', item.ichiban_kuji_prize_id)

        if (updatePrizeError) {
          // Rollback: delete items and sale
          await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: `Failed to deduct prize inventory: ${updatePrizeError.message}` },
            { status: 500 }
          )
        }
      }
    }

    // 6. Update sale to confirmed（不扣庫存，改由 delivery confirmed 扣庫存）
    // 計算履約狀態：根據品項級別的出貨狀態決定
    const deliveredItemCount = draft.items.filter((item: any) => item.is_delivered !== false).length
    const totalItemCount = draft.items.length
    let fulfillmentStatus = 'none'
    if (deliveredItemCount === totalItemCount) {
      fulfillmentStatus = 'completed'
    } else if (deliveredItemCount > 0) {
      fulfillmentStatus = 'partial'
    }

    const { data: confirmedSale, error: confirmError } = await (supabaseServer
      .from('sales') as any)
      .update({
        total: total,  // 使用抵扣购物金后的最终金额
        status: 'confirmed',
        fulfillment_status: fulfillmentStatus,
        updated_at: taiwanTime.toISOString(), // 使用台灣時間
      })
      .eq('id', sale.id)
      .select()
      .single()

    if (confirmError) {
      // Rollback: restore ONLY ichiban kuji remaining
      for (const item of draft.items) {
        // 恢復一番賞庫存
        if (item.ichiban_kuji_prize_id) {
          const { data: prize } = await (supabaseServer
            .from('ichiban_kuji_prizes') as any)
            .select('remaining')
            .eq('id', item.ichiban_kuji_prize_id)
            .single()

          if (prize) {
            await (supabaseServer
              .from('ichiban_kuji_prizes') as any)
              .update({ remaining: prize.remaining + item.quantity })
              .eq('id', item.ichiban_kuji_prize_id)
          }
        }
      }
      // Delete items and sale
      await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: confirmError.message },
        { status: 500 }
      )
    }

    // 6.5. 更新帳戶餘額（已付款 或 部分收款時）
    const partialPayment = body.partial_payment
    const hasPartialPayment = partialPayment && partialPayment.amount > 0 && partialPayment.amount < total

    if (draft.is_paid || hasPartialPayment) {
      // Determine payments to process
      let paymentsToProcess: { method: string; account_id: string | null; amount: number }[]

      if (hasPartialPayment) {
        // 部分收款：只處理已收金額
        paymentsToProcess = [{
          method: partialPayment.method || draft.payment_method,
          account_id: partialPayment.account_id || accountId,
          amount: partialPayment.amount
        }]
      } else if (draft.payments && draft.payments.length > 0) {
        // 多元付款
        paymentsToProcess = draft.payments.map((p: any) => ({
          method: p.method,
          account_id: p.account_id || null,
          amount: p.amount
        }))
      } else {
        // 一般付款
        paymentsToProcess = [{ method: draft.payment_method, account_id: accountId, amount: total }]
      }

      // Process each payment
      for (const payment of paymentsToProcess) {
        let paymentAccountId = payment.account_id || null

        // Fallback: lookup by method name if account_id not provided
        if (!paymentAccountId && payment.method) {
          const { data: paymentAccount } = await (supabaseServer
            .from('accounts') as any)
            .select('id')
            .eq('account_name', payment.method)
            .eq('is_active', true)
            .single()

          if (!paymentAccount) {
            // Try legacy payment_method_code lookup
            const { data: legacyAccount } = await (supabaseServer
              .from('accounts') as any)
              .select('id')
              .eq('payment_method_code', payment.method)
              .eq('is_active', true)
              .single()

            paymentAccountId = legacyAccount?.id || null
          } else {
            paymentAccountId = paymentAccount.id
          }
        }

        if (paymentAccountId) {
          const accountUpdate = await updateAccountBalance({
            supabase: supabaseServer,
            accountId: paymentAccountId,
            paymentMethod: payment.method,
            amount: payment.amount,
            direction: 'increase', // 銷售收款 = 現金流入
            transactionType: 'sale',
            referenceId: sale.id,
            referenceNo: sale.sale_no,
            note: hasPartialPayment
              ? `部分收款 - $${payment.amount}（訂單總額 $${total}）`
              : draft.payments && draft.payments.length > 1
                ? `多元付款 - ${payment.method}: $${payment.amount}`
                : draft.note
          })

          if (!accountUpdate.success) {
            console.error(`[Sales API] 銷售 ${sale.sale_no} 更新帳戶 ${payment.method} 餘額失敗:`, accountUpdate.error)
          }
        } else {
          console.warn(`[Sales API] 找不到付款方式 ${payment.method} 對應的帳戶`)
        }
      }
    }

    // 7. 創建出貨單（支援品項級別的出貨狀態）
    const { data: allDeliveries } = await (supabaseServer
      .from('deliveries') as any)
      .select('delivery_no')

    let deliveryCount = 0
    if (allDeliveries && allDeliveries.length > 0) {
      // 從所有 delivery_no 中找出最大的數字
      const maxNumber = allDeliveries.reduce((max: number, delivery: any) => {
        const match = delivery.delivery_no.match(/\d+/)
        if (match) {
          const num = parseInt(match[0], 10)
          return num > max ? num : max
        }
        return max
      }, 0)
      deliveryCount = maxNumber
    }

    // 分離已出貨和未出貨的品項
    const deliveredItems: any[] = []
    const undeliveredItems: any[] = []

    insertedSaleItems.forEach((saleItem: any, index: number) => {
      const originalItem = draft.items[index]
      const itemIsDelivered = originalItem.is_delivered !== false // 預設為已出貨

      if (itemIsDelivered) {
        deliveredItems.push({ saleItem, originalItem })
      } else {
        undeliveredItems.push({ saleItem, originalItem })
      }
    })

    let confirmedDelivery: any = null
    let draftDelivery: any = null

    // 8a. 為已出貨的品項創建 confirmed 出貨單
    if (deliveredItems.length > 0) {
      const deliveryNo = generateCode('D', deliveryCount)
      deliveryCount++

      const { data: delivery, error: deliveryError } = await (supabaseServer
        .from('deliveries') as any)
        .insert({
          delivery_no: deliveryNo,
          sale_id: sale.id,
          status: 'confirmed',
          delivery_date: taiwanTime.toISOString(),
          method: delivery_method || null,
          note: delivery_note || null,
        })
        .select()
        .single()

      if (deliveryError) {
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          { ok: false, error: deliveryError.message },
          { status: 500 }
        )
      }

      confirmedDelivery = delivery

      // 創建已出貨品項的出貨明細
      const deliveryItemsData = deliveredItems.map(({ saleItem }) => ({
        delivery_id: delivery.id,
        sale_item_id: saleItem.id,
        product_id: saleItem.product_id,
        quantity: saleItem.quantity,
      }))

      const { error: deliveryItemsError } = await (supabaseServer
        .from('delivery_items') as any)
        .insert(deliveryItemsData)

      if (deliveryItemsError) {
        await (supabaseServer.from('deliveries') as any).delete().eq('id', delivery.id)
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          { ok: false, error: deliveryItemsError.message },
          { status: 500 }
        )
      }

      // 9a. 為已出貨品項扣庫存
      const { data: existingLogs } = await (supabaseServer
        .from('inventory_logs') as any)
        .select('id')
        .eq('ref_type', 'delivery')
        .eq('ref_id', delivery.id)
        .limit(1)

      if (!existingLogs || existingLogs.length === 0) {
        console.log('=== 开始扣库存（已出貨品項）===')
        for (const { saleItem, originalItem } of deliveredItems) {
          console.log(`处理商品: ${saleItem.product_id}, 数量: ${saleItem.quantity}`)
          if (!originalItem.ichiban_kuji_prize_id) {
            await (supabaseServer
              .from('inventory_logs') as any)
              .insert({
                product_id: saleItem.product_id,
                ref_type: 'delivery',
                ref_id: delivery.id,
                qty_change: -saleItem.quantity,
                memo: `出貨扣庫存 - ${deliveryNo}`,
              })
          }
        }
      }
    }

    // 8b. 為未出貨的品項創建 draft 出貨單
    if (undeliveredItems.length > 0) {
      const deliveryNo = generateCode('D', deliveryCount)

      const { data: delivery, error: deliveryError } = await (supabaseServer
        .from('deliveries') as any)
        .insert({
          delivery_no: deliveryNo,
          sale_id: sale.id,
          status: 'draft',
          delivery_date: null,
          method: delivery_method || null,
          note: delivery_note || null,
        })
        .select()
        .single()

      if (deliveryError) {
        if (confirmedDelivery) {
          await (supabaseServer.from('delivery_items') as any).delete().eq('delivery_id', confirmedDelivery.id)
          await (supabaseServer.from('deliveries') as any).delete().eq('id', confirmedDelivery.id)
        }
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          { ok: false, error: deliveryError.message },
          { status: 500 }
        )
      }

      draftDelivery = delivery

      // 創建未出貨品項的出貨明細（不扣庫存）
      const deliveryItemsData = undeliveredItems.map(({ saleItem }) => ({
        delivery_id: delivery.id,
        sale_item_id: saleItem.id,
        product_id: saleItem.product_id,
        quantity: saleItem.quantity,
      }))

      const { error: deliveryItemsError } = await (supabaseServer
        .from('delivery_items') as any)
        .insert(deliveryItemsData)

      if (deliveryItemsError) {
        await (supabaseServer.from('deliveries') as any).delete().eq('id', delivery.id)
        if (confirmedDelivery) {
          await (supabaseServer.from('delivery_items') as any).delete().eq('delivery_id', confirmedDelivery.id)
          await (supabaseServer.from('deliveries') as any).delete().eq('id', confirmedDelivery.id)
        }
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          { ok: false, error: deliveryItemsError.message },
          { status: 500 }
        )
      }

      console.log(`=== 未出貨品項 ${undeliveredItems.length} 項，已建立待出貨單 ${deliveryNo} ===`)
    }

    // 用於後續的 delivery 變數（向後兼容）
    const delivery = confirmedDelivery || draftDelivery

    // 10. 點數累積（如果有選擇點數計劃且有客戶）
    let pointsEarned = 0
    let pointCostEstimated = 0

    if (pointProgramId && draft.customer_code) {
      // 取得客戶 ID
      const { data: customerData } = await (supabaseServer
        .from('customers') as any)
        .select('id')
        .eq('customer_code', draft.customer_code)
        .single()

      if (customerData) {
        // 取得點數計劃
        const { data: program } = await (supabaseServer
          .from('point_programs') as any)
          .select('*')
          .eq('id', pointProgramId)
          .eq('is_active', true)
          .single()

        if (program) {
          // 計算獲得的點數（使用原始 total，不是扣除購物金後的金額）
          pointsEarned = Math.floor(total / program.spend_per_point)

          if (pointsEarned > 0) {
            // 計算預估成本
            pointCostEstimated = pointsEarned * Number(program.cost_per_point)

            // 更新或建立客戶點數餘額
            const { data: existingPoints } = await (supabaseServer
              .from('customer_points') as any)
              .select('*')
              .eq('customer_id', customerData.id)
              .eq('program_id', pointProgramId)
              .single()

            if (existingPoints) {
              // 更新現有點數
              await (supabaseServer
                .from('customer_points') as any)
                .update({
                  points: existingPoints.points + pointsEarned,
                  total_earned: existingPoints.total_earned + pointsEarned,
                  estimated_cost: Number(existingPoints.estimated_cost) + pointCostEstimated,
                  updated_at: getTaiwanTime()
                })
                .eq('id', existingPoints.id)
            } else {
              // 建立新的點數記錄
              await (supabaseServer
                .from('customer_points') as any)
                .insert({
                  customer_id: customerData.id,
                  program_id: pointProgramId,
                  points: pointsEarned,
                  total_earned: pointsEarned,
                  total_redeemed: 0,
                  estimated_cost: pointCostEstimated
                })
            }

            // 記錄點數日誌
            await (supabaseServer
              .from('point_logs') as any)
              .insert({
                customer_id: customerData.id,
                program_id: pointProgramId,
                sale_id: sale.id,
                change_type: 'earn',
                points_change: pointsEarned,
                cost_amount: pointCostEstimated,
                sale_amount: total,
                note: `銷售單 ${sale.sale_no} 累積 ${pointsEarned} 點（消費 $${total}）`,
                created_at: getTaiwanTime()
              })

            // 更新銷售單的點數資訊
            await (supabaseServer
              .from('sales') as any)
              .update({
                points_earned: pointsEarned,
                point_cost_estimated: pointCostEstimated
              })
              .eq('id', sale.id)
          }
        }
      }
    }

    // 11. 自動創建應收帳款（AR）記錄 - 如果客戶未付款且有應收金額，或部分收款有未收金額
    // 計算應收金額：部分收款 = total - 已收金額，完全未付 = total
    const unpaidAmount = hasPartialPayment
      ? total - partialPayment.amount
      : (!draft.is_paid ? total : 0)

    if (draft.customer_code && unpaidAmount > 0) {
      // 計算每個商品的到期日（預設 7 天後）
      const dueDate = new Date(taiwanTime)
      dueDate.setDate(dueDate.getDate() + 7)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      // 計算總小計（用於按比例分配）
      const totalSubtotal = insertedSaleItems.reduce((sum: number, item: any) => sum + item.subtotal, 0)

      // 為每個銷售明細創建 AR 記錄（按比例分配未收金額）
      let remainingArAmount = unpaidAmount // 用於處理四捨五入誤差
      const arRecords = insertedSaleItems.map((saleItem: any, index: number) => {
        let itemAmount: number
        if (index === insertedSaleItems.length - 1) {
          // 最後一筆用剩餘金額，避免四捨五入誤差
          itemAmount = remainingArAmount
        } else {
          // 按比例分配
          itemAmount = Math.round(unpaidAmount * (saleItem.subtotal / totalSubtotal))
          remainingArAmount -= itemAmount
        }

        return {
          partner_type: 'customer',
          partner_code: draft.customer_code,
          direction: 'AR',
          ref_type: 'sale',
          ref_id: sale.id,
          sale_item_id: saleItem.id,
          amount: itemAmount,
          received_paid: 0,
          due_date: dueDateStr,
          status: 'unpaid',
          note: hasPartialPayment
            ? `銷售單 ${sale.sale_no}（部分收款，未收 $${unpaidAmount}）`
            : `銷售單 ${sale.sale_no}`,
        }
      }).filter((ar: any) => ar.amount > 0) // 過濾掉金額為 0 的記錄

      if (arRecords.length > 0) {
        const { error: arError } = await (supabaseServer
          .from('partner_accounts') as any)
          .insert(arRecords)

        if (arError) {
          console.error('Failed to create AR records:', arError)
          // AR 創建失敗不影響銷售流程，只記錄錯誤
        } else {
          console.log(`[Sales API] 銷售 ${sale.sale_no} 建立 AR 記錄，未收金額: $${unpaidAmount}`)
        }
      }
    }

    return NextResponse.json(
      { ok: true, data: confirmedSale },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
