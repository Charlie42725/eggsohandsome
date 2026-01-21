import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { z } from 'zod'
import { fromZodError } from 'zod-validation-error'
import { getTaiwanTime } from '@/lib/timezone'

type RouteContext = {
  params: Promise<{ id: string }>
}

// Schema for basic purchase update
const purchaseUpdateSchema = z.object({
  vendor_code: z.string().optional(),
  note: z.string().optional().nullable(),
  purchase_date: z.string().optional(),
})

// GET /api/purchases/:id - Get purchase details with items
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // Get purchase with vendor and items
    const { data: purchase, error: purchaseError } = await (supabaseServer
      .from('purchases') as any)
      .select(`
        *,
        vendors (
          vendor_name
        ),
        purchase_items (
          id,
          product_id,
          quantity,
          cost,
          subtotal,
          products (
            id,
            item_code,
            name,
            unit,
            cost,
            stock
          )
        )
      `)
      .eq('id', id)
      .single()

    if (purchaseError) {
      return NextResponse.json(
        { ok: false, error: 'Purchase not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      data: purchase,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/purchases/:id - Update purchase basic info
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    // Validate input
    const validation = purchaseUpdateSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const updates = validation.data

    // 獲取當前進貨單資訊
    const { data: currentPurchase, error: fetchError } = await (supabaseServer
      .from('purchases') as any)
      .select('vendor_code, status')
      .eq('id', id)
      .single()

    if (fetchError || !currentPurchase) {
      return NextResponse.json(
        { ok: false, error: '進貨單不存在' },
        { status: 404 }
      )
    }

    // 如果要修改廠商，驗證新廠商是否存在
    if (updates.vendor_code && updates.vendor_code !== currentPurchase.vendor_code) {
      const { data: vendor } = await (supabaseServer
        .from('vendors') as any)
        .select('id')
        .eq('vendor_code', updates.vendor_code)
        .single()

      if (!vendor) {
        return NextResponse.json(
          { ok: false, error: `廠商不存在: ${updates.vendor_code}` },
          { status: 400 }
        )
      }
    }

    // 更新進貨單
    const updateData: any = {}
    if (updates.vendor_code) updateData.vendor_code = updates.vendor_code
    if (updates.note !== undefined) updateData.note = updates.note
    if (updates.purchase_date) updateData.purchase_date = updates.purchase_date

    const { data: purchase, error: updateError } = await (supabaseServer
      .from('purchases') as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      data: purchase,
      message: '進貨單更新成功'
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/purchases/:id - Delete purchase and restore inventory
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 0. Get purchase status and items before deletion
    const { data: purchase, error: purchaseError } = await (supabaseServer
      .from('purchases') as any)
      .select(`
        status,
        purchase_items (
          id,
          product_id,
          quantity,
          cost,
          received_quantity
        )
      `)
      .eq('id', id)
      .single()

    if (purchaseError || !purchase) {
      return NextResponse.json(
        { ok: false, error: '進貨單不存在' },
        { status: 404 }
      )
    }

    // 1. Restore inventory based on actual received quantity
    // 只回补已经收货的数量，而不是全部进货数量
    if (purchase.purchase_items && purchase.purchase_items.length > 0) {
      console.log(`[Delete Purchase ${id}] Processing ${purchase.purchase_items.length} items`)
      console.log(`[Delete Purchase ${id}] Purchase status: ${purchase.status}`)

      for (const item of purchase.purchase_items) {
        const receivedQty = item.received_quantity || 0
        console.log(`[Delete Purchase ${id}] Item ${item.id}: quantity=${item.quantity}, received_quantity=${item.received_quantity}, receivedQty=${receivedQty}`)

        // 只有已收货的才需要回补库存
        if (receivedQty > 0) {
          console.log(`[Delete Purchase ${id}] Restoring ${receivedQty} units for product ${item.product_id}`)

          // 寫入負數的庫存日誌來回補庫存（trigger 會自動更新 products.stock）
          const { error: logInsertError } = await (supabaseServer
            .from('inventory_logs') as any)
            .insert({
              product_id: item.product_id,
              ref_type: 'purchase_delete',
              ref_id: id,
              qty_change: -receivedQty,
              memo: `刪除進貨單回補庫存 - 進貨單 ID: ${id}`,
            })

          if (logInsertError) {
            console.error(`[Delete Purchase ${id}] Failed to insert inventory_log:`, logInsertError)
          } else {
            console.log(`[Delete Purchase ${id}] Successfully inserted inventory_log for product ${item.product_id}`)
          }

          // 更新平均成本
          const { data: product } = await (supabaseServer
            .from('products') as any)
            .select('stock, avg_cost')
            .eq('id', item.product_id)
            .single()

          if (product) {
            const currentStock = product.stock  // trigger 已經更新過的庫存
            const oldAvgCost = product.avg_cost

            // 計算新的平均成本（移除這次進貨的成本貢獻）
            let newAvgCost = oldAvgCost
            if (currentStock > 0) {
              const oldStock = currentStock + receivedQty
              const totalCostBefore = oldStock * oldAvgCost
              const purchaseCost = receivedQty * item.cost
              newAvgCost = (totalCostBefore - purchaseCost) / currentStock

              if (newAvgCost < 0) newAvgCost = 0
            } else {
              newAvgCost = 0
            }

            // 只更新平均成本
            await (supabaseServer
              .from('products') as any)
              .update({ avg_cost: newAvgCost })
              .eq('id', item.product_id)

            console.log(`[Delete Purchase ${id}] Restored product ${item.product_id}: stock reduced by ${receivedQty}, avg_cost: ${oldAvgCost.toFixed(2)} -> ${newAvgCost.toFixed(2)}`)
          }
        } else {
          console.log(`[Delete Purchase ${id}] Item ${item.id} has not been received, no inventory to restore`)
        }
      }
    }

    // 2. 回補已付款的帳戶餘額
    // 查詢與此進貨單相關的付款記錄（settlements）
    const { data: itemsForAP } = await (supabaseServer
      .from('purchase_items') as any)
      .select('id')
      .eq('purchase_id', id)

    const itemIds = itemsForAP?.map((item: any) => item.id) || []

    // 查詢 AP 記錄，找出關聯的 settlement_allocations
    if (itemIds.length > 0) {
      const { data: apRecords } = await (supabaseServer
        .from('partner_accounts') as any)
        .select('id')
        .in('purchase_item_id', itemIds)

      if (apRecords && apRecords.length > 0) {
        const apIds = apRecords.map((ap: any) => ap.id)

        // 查詢關聯的 settlement_allocations
        const { data: allocations } = await (supabaseServer
          .from('settlement_allocations') as any)
          .select('settlement_id, amount')
          .in('partner_account_id', apIds)

        if (allocations && allocations.length > 0) {
          // 找出所有關聯的 settlements
          const settlementIds = [...new Set(allocations.map((a: any) => a.settlement_id))]

          for (const settlementId of settlementIds) {
            // 查詢 settlement 資訊
            const { data: settlement } = await (supabaseServer
              .from('settlements') as any)
              .select('amount, account_id')
              .eq('id', settlementId)
              .single()

            if (settlement && settlement.account_id) {
              // 刪除 account_transactions 記錄
              await (supabaseServer
                .from('account_transactions') as any)
                .delete()
                .eq('ref_type', 'settlement')
                .eq('ref_id', settlementId)

              // 回補帳戶餘額（刪除場景：直接還原，不創建反向記錄）
              const { data: account } = await (supabaseServer
                .from('accounts') as any)
                .select('balance')
                .eq('id', settlement.account_id)
                .single()

              if (account) {
                const newBalance = Number(account.balance) + settlement.amount
                await (supabaseServer
                  .from('accounts') as any)
                  .update({
                    balance: newBalance,
                    updated_at: getTaiwanTime()
                  })
                  .eq('id', settlement.account_id)

                console.log(`[Delete Purchase ${id}] Restored account ${settlement.account_id}: +${settlement.amount}`)
              }
            }

            // 刪除 settlement_allocations
            await (supabaseServer
              .from('settlement_allocations') as any)
              .delete()
              .eq('settlement_id', settlementId)

            // 刪除 settlement
            await (supabaseServer
              .from('settlements') as any)
              .delete()
              .eq('id', settlementId)
          }
        }
      }

      // 刪除 AP 記錄
      await (supabaseServer
        .from('partner_accounts') as any)
        .delete()
        .in('purchase_item_id', itemIds)
    }

    // 也刪除舊方法的 AP 記錄（向後兼容）
    await (supabaseServer
      .from('partner_accounts') as any)
      .delete()
      .eq('ref_type', 'purchase')
      .eq('ref_id', id)

    // 3. Delete purchase items
    await (supabaseServer.from('purchase_items') as any).delete().eq('purchase_id', id)

    // 4. Delete purchase
    const { error: deleteError } = await (supabaseServer
      .from('purchases') as any)
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      )
    }

    console.log(`[Delete Purchase ${id}] Successfully deleted purchase and restored inventory`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
