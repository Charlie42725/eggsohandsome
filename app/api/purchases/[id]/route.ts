import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

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
          cost
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

    // 1. Restore inventory if purchase was confirmed
    // Only confirmed purchases have updated inventory
    if (purchase.status === 'confirmed' && purchase.purchase_items) {
      console.log(`[Delete Purchase ${id}] Restoring inventory for ${purchase.purchase_items.length} items`)

      for (const item of purchase.purchase_items) {
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
          // We need to remove the cost contribution of this purchase
          let newAvgCost = oldAvgCost
          if (newStock > 0 && oldStock > 0) {
            // Reverse calculation: remove this purchase's cost contribution
            const totalCostBefore = oldStock * oldAvgCost
            const purchaseCost = item.quantity * item.cost
            newAvgCost = (totalCostBefore - purchaseCost) / newStock
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

          console.log(`[Delete Purchase ${id}] Restored inventory for product ${item.product_id}: ${oldStock} -> ${newStock}, avg_cost: ${oldAvgCost.toFixed(2)} -> ${newAvgCost.toFixed(2)}`)
        }
      }
    } else if (purchase.status === 'pending') {
      console.log(`[Delete Purchase ${id}] Purchase was pending, no inventory to restore`)
    }

    // 2. Delete related partner accounts (AP)
    // Delete by purchase_item_id (new method)
    const { data: itemsForAP, error: itemsForAPError } = await (supabaseServer
      .from('purchase_items') as any)
      .select('id')
      .eq('purchase_id', id)

    if (!itemsForAPError && itemsForAP && itemsForAP.length > 0) {
      const itemIds = itemsForAP.map((item: any) => item.id)

      // Delete AP records by purchase_item_id
      await (supabaseServer
        .from('partner_accounts') as any)
        .delete()
        .in('purchase_item_id', itemIds)
    }

    // Also delete by ref_id (old method, for backward compatibility)
    const { error: apDeleteError2 } = await (supabaseServer
      .from('partner_accounts') as any)
      .delete()
      .eq('ref_type', 'purchase')
      .eq('ref_id', id)

    if (apDeleteError2) {
      return NextResponse.json(
        { ok: false, error: `Failed to delete AP: ${apDeleteError2.message}` },
        { status: 500 }
      )
    }

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
