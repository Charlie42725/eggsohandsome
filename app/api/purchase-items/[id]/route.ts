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

    // 1. Get purchase item details
    const { data: item, error: fetchError } = await (supabaseServer
      .from('purchase_items') as any)
      .select('*, purchases!inner(status)')
      .eq('id', id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json(
        { ok: false, error: 'Purchase item not found' },
        { status: 404 }
      )
    }

    // 2. Restore inventory if purchase was confirmed
    if (item.purchases.status === 'confirmed') {
      console.log(`[Delete Purchase Item ${id}] Restoring inventory for product ${item.product_id}`)

      // Get current product stock and avg_cost
      const { data: product } = await (supabaseServer
        .from('products') as any)
        .select('stock, avg_cost')
        .eq('id', item.product_id)
        .single()

      if (product) {
        const oldStock = product.stock
        const oldAvgCost = product.avg_cost
        const newStock = oldStock - item.quantity

        // Calculate new average cost (reverse the purchase)
        let newAvgCost = oldAvgCost
        if (newStock > 0 && oldStock > 0) {
          // Reverse calculation: remove this item's cost contribution
          const totalCostBefore = oldStock * oldAvgCost
          const itemCost = item.quantity * item.cost
          newAvgCost = (totalCostBefore - itemCost) / newStock
        } else if (newStock <= 0) {
          // If stock becomes 0 or negative, reset avg_cost
          newAvgCost = 0
        }

        // Update product stock and avg_cost
        await (supabaseServer
          .from('products') as any)
          .update({
            stock: newStock,
            avg_cost: newAvgCost,
          })
          .eq('id', item.product_id)

        console.log(`[Delete Purchase Item ${id}] Restored inventory: ${oldStock} -> ${newStock}, avg_cost: ${oldAvgCost.toFixed(2)} -> ${newAvgCost.toFixed(2)}`)
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
