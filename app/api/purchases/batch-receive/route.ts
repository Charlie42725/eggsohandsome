import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// POST /api/purchases/batch-receive - 批量收货多个进货单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { purchase_ids } = body

    if (!purchase_ids || !Array.isArray(purchase_ids) || purchase_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: '請選擇至少一筆進貨單' },
        { status: 400 }
      )
    }

    const results: {
      success: number
      failed: number
      details: Array<{ purchase_id: string; purchase_no: string; status: 'success' | 'failed'; error?: string; items_received: number }>
    } = {
      success: 0,
      failed: 0,
      details: []
    }

    // Process each purchase
    for (const purchaseId of purchase_ids) {
      try {
        // 1. Get purchase with items
        const { data: purchase, error: purchaseError } = await (supabaseServer
          .from('purchases') as any)
          .select(`
            id,
            purchase_no,
            status,
            purchase_items (
              id,
              product_id,
              quantity,
              cost,
              received_quantity,
              is_received
            )
          `)
          .eq('id', purchaseId)
          .single()

        if (purchaseError || !purchase) {
          results.failed++
          results.details.push({
            purchase_id: purchaseId,
            purchase_no: 'Unknown',
            status: 'failed',
            error: '找不到進貨單',
            items_received: 0
          })
          continue
        }

        // 2. Check if purchase is approved
        if (purchase.status !== 'approved') {
          results.failed++
          results.details.push({
            purchase_id: purchaseId,
            purchase_no: purchase.purchase_no,
            status: 'failed',
            error: '進貨單尚未審核通過',
            items_received: 0
          })
          continue
        }

        // 3. Get items that need receiving
        const itemsToReceive = (purchase.purchase_items || []).filter(
          (item: any) => !item.is_received && (item.received_quantity || 0) < item.quantity
        )

        if (itemsToReceive.length === 0) {
          // Already fully received
          results.success++
          results.details.push({
            purchase_id: purchaseId,
            purchase_no: purchase.purchase_no,
            status: 'success',
            items_received: 0
          })
          continue
        }

        let itemsReceivedCount = 0

        // 4. Process each item
        for (const item of itemsToReceive) {
          const receivedQuantity = item.received_quantity || 0
          const remainingQuantity = item.quantity - receivedQuantity

          if (remainingQuantity <= 0) continue

          // Update purchase_item
          const { error: updateItemError } = await (supabaseServer
            .from('purchase_items') as any)
            .update({
              received_quantity: item.quantity,
              is_received: true,
            })
            .eq('id', item.id)

          if (updateItemError) {
            console.error(`Failed to update purchase_item ${item.id}:`, updateItemError.message)
            continue
          }

          // Create inventory log
          const { error: logError } = await (supabaseServer
            .from('inventory_logs') as any)
            .insert({
              product_id: item.product_id,
              ref_type: 'purchase',
              ref_id: purchaseId,
              qty_change: remainingQuantity,
              memo: `批量收貨 - 進貨單: ${purchase.purchase_no} (收貨數量: ${remainingQuantity})`,
            })

          if (logError) {
            console.error(`Failed to create inventory log for item ${item.id}:`, logError.message)
            continue
          }

          // Update product avg_cost
          const { data: product } = await (supabaseServer
            .from('products') as any)
            .select('stock, avg_cost')
            .eq('id', item.product_id)
            .single()

          if (product) {
            const currentStock = product.stock
            const oldAvgCost = product.avg_cost || 0

            let newAvgCost = oldAvgCost
            if (currentStock > 0) {
              const oldStock = currentStock - remainingQuantity
              newAvgCost = ((oldStock * oldAvgCost) + (remainingQuantity * item.cost)) / currentStock
            }

            await (supabaseServer
              .from('products') as any)
              .update({ avg_cost: newAvgCost })
              .eq('id', item.product_id)
          }

          itemsReceivedCount++
        }

        results.success++
        results.details.push({
          purchase_id: purchaseId,
          purchase_no: purchase.purchase_no,
          status: 'success',
          items_received: itemsReceivedCount
        })

      } catch (error) {
        console.error(`Error processing purchase ${purchaseId}:`, error)
        results.failed++
        results.details.push({
          purchase_id: purchaseId,
          purchase_no: 'Unknown',
          status: 'failed',
          error: '處理時發生錯誤',
          items_received: 0
        })
      }
    }

    return NextResponse.json({
      ok: true,
      data: results,
      message: `批量收貨完成：成功 ${results.success} 筆，失敗 ${results.failed} 筆`
    })

  } catch (error) {
    console.error('Batch receive error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
