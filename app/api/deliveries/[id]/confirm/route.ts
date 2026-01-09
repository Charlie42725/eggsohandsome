import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

// PATCH /api/deliveries/:id/confirm - 確認出貨（從 route.ts 移過來的專用端點）
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 獲取出貨單資訊
    const { data: delivery, error: fetchError } = await (supabaseServer
      .from('deliveries') as any)
      .select(`
        *,
        delivery_items (
          product_id,
          quantity
        )
      `)
      .eq('id', id)
      .single()

    if (fetchError || !delivery) {
      return NextResponse.json(
        { ok: false, error: '出貨單不存在' },
        { status: 404 }
      )
    }

    if (delivery.status === 'confirmed') {
      return NextResponse.json(
        { ok: false, error: '此出貨單已確認，無需重複操作' },
        { status: 400 }
      )
    }

    if (delivery.status === 'cancelled') {
      return NextResponse.json(
        { ok: false, error: '已取消的出貨單無法確認' },
        { status: 400 }
      )
    }

    // 🔒 冪等保護：檢查是否已經扣過庫存
    const { data: existingLogs } = await (supabaseServer
      .from('inventory_logs') as any)
      .select('id')
      .eq('ref_type', 'delivery')
      .eq('ref_id', id)
      .limit(1)

    if (existingLogs && existingLogs.length > 0) {
      return NextResponse.json(
        { ok: false, error: '此出貨單已扣過庫存，無法重複扣減' },
        { status: 400 }
      )
    }

    // 檢查庫存是否足夠
    for (const item of delivery.delivery_items) {
      const { data: product } = await (supabaseServer
        .from('products') as any)
        .select('stock, allow_negative, name')
        .eq('id', item.product_id)
        .single()

      if (!product) {
        return NextResponse.json(
          { ok: false, error: `商品不存在：${item.product_id}` },
          { status: 404 }
        )
      }

      if (!product.allow_negative && product.stock < item.quantity) {
        return NextResponse.json(
          {
            ok: false,
            error: `${product.name} 庫存不足。剩餘: ${product.stock}, 需要: ${item.quantity}`,
          },
          { status: 400 }
        )
      }
    }

    // 扣庫存：只寫入 inventory_logs，trigger 會自動更新 products.stock
    for (const item of delivery.delivery_items) {
      // 🔧 修复：移除手动更新 stock，只寫入庫存日誌（trigger 會自動處理）
      await (supabaseServer
        .from('inventory_logs') as any)
        .insert({
          product_id: item.product_id,
          ref_type: 'delivery',
          ref_id: id,
          qty_change: -item.quantity,
          memo: `出貨扣庫存 - ${delivery.delivery_no}`,
        })
    }

    // 更新出貨單狀態
    const { data: confirmedDelivery, error: updateError } = await (supabaseServer
      .from('deliveries') as any)
      .update({
        status: 'confirmed',
        delivery_date: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      )
    }

    // 更新 sales 的履約狀態
    await (supabaseServer
      .from('sales') as any)
      .update({ fulfillment_status: 'completed' })
      .eq('id', delivery.sale_id)

    return NextResponse.json({
      ok: true,
      data: confirmedDelivery,
      message: '出貨確認成功，庫存已扣減',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
