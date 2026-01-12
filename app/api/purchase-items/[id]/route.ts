import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

// DELETE /api/purchase-items/:id - Delete single purchase item and restore inventory
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 1. Get purchase item details including received_quantity
    const { data: item, error: fetchError } = await (supabaseServer
      .from('purchase_items') as any)
      .select(`
        *,
        purchases!inner(status)
      `)
      .eq('id', id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json(
        { ok: false, error: 'Purchase item not found' },
        { status: 404 }
      )
    }

    // 2. Restore inventory based on actual received quantity
    const receivedQty = item.received_quantity || 0

    if (receivedQty > 0) {
      console.log(`[Delete Purchase Item ${id}] Restoring ${receivedQty} units for product ${item.product_id}`)

      // 寫入負數的庫存日誌來回補庫存（trigger 會自動更新 products.stock）
      await (supabaseServer
        .from('inventory_logs') as any)
        .insert({
          product_id: item.product_id,
          ref_type: 'purchase_item_delete',
          ref_id: id,
          qty_change: -receivedQty,
          memo: `刪除進貨明細回補庫存 - 明細 ID: ${id}`,
        })

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
          const itemCost = receivedQty * item.cost
          newAvgCost = (totalCostBefore - itemCost) / currentStock

          if (newAvgCost < 0) newAvgCost = 0
        } else {
          newAvgCost = 0
        }

        // 只更新平均成本
        await (supabaseServer
          .from('products') as any)
          .update({ avg_cost: newAvgCost })
          .eq('id', item.product_id)

        console.log(`[Delete Purchase Item ${id}] Restored inventory: stock reduced by ${receivedQty}, avg_cost: ${oldAvgCost.toFixed(2)} -> ${newAvgCost.toFixed(2)}`)
      }
    } else {
      console.log(`[Delete Purchase Item ${id}] Item has not been received, no inventory to restore`)
    }

    // 3. Update purchase total
      const { data: remainingItems } = await (supabaseServer
        .from('purchase_items') as any)
        .select('quantity, cost')
        .eq('purchase_id', item.purchase_id)
        .neq('id', id)

      const newTotal = (remainingItems || []).reduce(
        (sum: number, i: any) => sum + (i.quantity * i.cost),
        0
      )

      await (supabaseServer
        .from('purchases') as any)
        .update({ total: newTotal })
        .eq('id', item.purchase_id)
    }

    // 4. Delete related partner accounts (AP) for this item
    const { error: apDeleteError } = await (supabaseServer
      .from('partner_accounts') as any)
      .delete()
      .eq('purchase_item_id', id)

    if (apDeleteError) {
      console.error('Failed to delete AP record:', apDeleteError)
      // Don't fail the whole operation, just log the error
    }

    // 5. Delete purchase item
    const { error: deleteError } = await (supabaseServer
      .from('purchase_items') as any)
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      )
    }

    console.log(`[Delete Purchase Item ${id}] Successfully deleted item and restored inventory`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
