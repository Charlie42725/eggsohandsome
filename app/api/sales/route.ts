import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { saleDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { generateCode } from '@/lib/utils'

// GET /api/sales - List sales with items summary
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const customerCode = searchParams.get('customer_code')
    const source = searchParams.get('source')
    const keyword = searchParams.get('keyword')
    const productKeyword = searchParams.get('product_keyword')

    let query = (supabaseServer
      .from('sales') as any)
      .select(`
        *,
        customers:customer_code (
          customer_name
        ),
        sale_items (
          id,
          quantity,
          price,
          snapshot_name,
          product_id,
          cost,
          products (
            item_code,
            unit
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (dateFrom) {
      query = query.gte('sale_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('sale_date', dateTo)
    }

    if (customerCode) {
      query = query.eq('customer_code', customerCode)
    }

    if (source) {
      query = query.eq('source', source)
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
      } else {
        query = query.ilike('sale_no', `%${keyword}%`)
      }
    }

    const { data, error } = await query

    if (error) {
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

    // Get delivery status for all sale_items
    const allSaleItemIds = filteredData?.flatMap((sale: any) => 
      sale.sale_items?.map((item: any) => item.id) || []
    )

    const deliveryStatusMap: { [key: string]: boolean } = {}
    
    if (allSaleItemIds && allSaleItemIds.length > 0) {
      const { data: deliveryItems } = await (supabaseServer
        .from('delivery_items') as any)
        .select(`
          sale_item_id,
          deliveries!inner (
            status
          )
        `)
        .in('sale_item_id', allSaleItemIds)
        .eq('deliveries.status', 'confirmed')

      deliveryItems?.forEach((di: any) => {
        deliveryStatusMap[di.sale_item_id] = true
      })
    }

    // Calculate summary for each sale and add delivery status to items
    const salesWithSummary = filteredData?.map((sale: any) => {
      const items = sale.sale_items || []
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      const avgPrice = items.length > 0
        ? items.reduce((sum: number, item: any) => sum + item.price, 0) / items.length
        : 0

      // Add delivery status to each item
      const itemsWithDeliveryStatus = items.map((item: any) => ({
        ...item,
        is_delivered: !!deliveryStatusMap[item.id]
      }))

      return {
        ...sale,
        item_count: items.length,
        total_quantity: totalQuantity,
        avg_price: avgPrice,
        sale_items: itemsWithDeliveryStatus
      }
    })

    return NextResponse.json({ ok: true, data: salesWithSummary })
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

    // Generate sale_no - 使用最新记录的编号来避免并发冲突
    const { data: lastSaleArray } = await supabaseServer
      .from('sales')
      .select('sale_no')
      .order('created_at', { ascending: false })
      .limit(1)

    let nextNumber = 1
    if (lastSaleArray && lastSaleArray.length > 0) {
      const lastSale = lastSaleArray[0] as { sale_no: string }
      // Extract number from sale_no (e.g., "S0001" -> 1)
      const match = lastSale.sale_no.match(/\d+/)
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1
      }
    }

    const saleNo = generateCode('S', nextNumber - 1)

    // Start transaction-like operations
    // 1. Create sale (draft)
    const { data: sale, error: saleError } = await (supabaseServer
      .from('sales') as any)
      .insert({
        sale_no: saleNo,
        customer_code: draft.customer_code || null,
        source: draft.source,
        payment_method: draft.payment_method,
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
          .select('name, cost')
          .eq('id', item.product_id)
          .single()

        return {
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          cost: product?.cost || 0,
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

    // 4.5. 自动使用购物金抵扣（如果有客户且购物金余额 > 0）
    let storeCreditUsed = 0
    let finalTotal = total

    if (draft.customer_code) {
      // 获取客户购物金余额
      const { data: customer, error: customerError } = await (supabaseServer
        .from('customers') as any)
        .select('store_credit, credit_limit')
        .eq('customer_code', draft.customer_code)
        .single()

      if (customer && customer.store_credit > 0) {
        // 计算可使用的购物金（不超过订单总额）
        storeCreditUsed = Math.min(customer.store_credit, total)
        finalTotal = total - storeCreditUsed

        // 更新客户购物金余额
        const newBalance = customer.store_credit - storeCreditUsed
        const { error: updateCustomerError } = await (supabaseServer
          .from('customers') as any)
          .update({ store_credit: newBalance })
          .eq('customer_code', draft.customer_code)

        if (updateCustomerError) {
          // Rollback: delete items and sale
          await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          return NextResponse.json(
            { ok: false, error: '更新客户购物金失败' },
            { status: 500 }
          )
        }

        // 记录购物金使用日志
        const { error: logError } = await (supabaseServer
          .from('customer_balance_logs') as any)
          .insert({
            customer_code: draft.customer_code,
            amount: -storeCreditUsed,
            balance_before: customer.store_credit,
            balance_after: newBalance,
            type: 'sale',
            ref_type: 'sale',
            ref_id: sale.id,
            ref_no: saleNo,
            note: `销售单 ${saleNo} 使用购物金`,
            created_by: null, // TODO: 从会话获取当前用户
          })

        if (logError) {
          console.error('Failed to create balance log:', logError)
          // 日志失败不影响销售流程，只记录错误
        }
      }
    }

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
    const { data: confirmedSale, error: confirmError } = await (supabaseServer
      .from('sales') as any)
      .update({
        total: finalTotal,  // 使用抵扣购物金后的最终金额
        status: 'confirmed',
        fulfillment_status: is_delivered ? 'completed' : 'none',
      })
      .eq('id', sale.id)
      .select()
      .single()

    if (confirmError) {
      // Rollback: restore customer store credit if used
      if (storeCreditUsed > 0 && draft.customer_code) {
        const { data: customer } = await (supabaseServer
          .from('customers') as any)
          .select('store_credit')
          .eq('customer_code', draft.customer_code)
          .single()

        if (customer) {
          await (supabaseServer
            .from('customers') as any)
            .update({ store_credit: customer.store_credit + storeCreditUsed })
            .eq('customer_code', draft.customer_code)
        }
      }

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

    // 7. 創建出貨單（使用當前最大編號 + 1 避免重複）
    const { data: lastDeliveries } = await (supabaseServer
      .from('deliveries') as any)
      .select('delivery_no')
      .order('created_at', { ascending: false })
      .limit(1)

    let deliveryCount = 0
    if (lastDeliveries && lastDeliveries.length > 0) {
      // 從 D0001 中提取數字部分
      const match = lastDeliveries[0].delivery_no.match(/\d+/)
      if (match) {
        deliveryCount = parseInt(match[0], 10)
      }
    }

    const deliveryNo = generateCode('D', deliveryCount)

    const { data: delivery, error: deliveryError } = await (supabaseServer
      .from('deliveries') as any)
      .insert({
        delivery_no: deliveryNo,
        sale_id: sale.id,
        status: is_delivered ? 'confirmed' : 'draft',
        delivery_date: is_delivered ? new Date().toISOString() : null,
        method: delivery_method || null,
        note: delivery_note || null,
      })
      .select()
      .single()

    if (deliveryError) {
      // Rollback
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: deliveryError.message },
        { status: 500 }
      )
    }

    // 8. 創建出貨明細（关联到sale_items）
    const deliveryItems = insertedSaleItems.map((saleItem: any, index: number) => ({
      delivery_id: delivery.id,
      sale_item_id: saleItem.id,
      product_id: saleItem.product_id,
      quantity: saleItem.quantity,
    }))

    const { error: deliveryItemsError } = await (supabaseServer
      .from('delivery_items') as any)
      .insert(deliveryItems)

    if (deliveryItemsError) {
      // Rollback
      await (supabaseServer.from('deliveries') as any).delete().eq('id', delivery.id)
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: deliveryItemsError.message },
        { status: 500 }
      )
    }

    // 9. 如果是已出貨，扣庫存（唯一入口）
    if (is_delivered) {
      // 🔒 冪等保護
      const { data: existingLogs } = await (supabaseServer
        .from('inventory_logs') as any)
        .select('id')
        .eq('ref_type', 'delivery')
        .eq('ref_id', delivery.id)
        .limit(1)

      if (!existingLogs || existingLogs.length === 0) {
        // 🐛 调试日志
        console.log('=== 开始扣库存 ===')
        console.log('draft.items:', JSON.stringify(draft.items, null, 2))
        console.log('delivery.id:', delivery.id)
        
        // 扣庫存：只寫入 inventory_logs，trigger 會自動更新 products.stock
        for (const item of draft.items) {
          console.log(`处理商品: ${item.product_id}, 数量: ${item.quantity}`)
          // 只扣一般商品庫存（一番賞已在前面扣過）
          if (!item.ichiban_kuji_prize_id) {
            // 🔧 修复：移除手动更新 stock，让 trigger 自动处理
            // 只寫入庫存日誌
            await (supabaseServer
              .from('inventory_logs') as any)
              .insert({
                product_id: item.product_id,
                ref_type: 'delivery',
                ref_id: delivery.id,
                qty_change: -item.quantity,
                memo: `出貨扣庫存 - ${deliveryNo}`,
              })
          }
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
