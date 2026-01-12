import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// POST /api/sale-items/batch-deliver - 批量出货多个商品明细
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sale_item_ids } = body

    if (!sale_item_ids || !Array.isArray(sale_item_ids) || sale_item_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: '请提供要出货的商品明细 ID 数组' },
        { status: 400 }
      )
    }

    // 1. 获取所有 sale_items 信息
    const { data: saleItems, error: fetchError } = await (supabaseServer
      .from('sale_items') as any)
      .select(`
        *,
        sales!inner (
          id,
          sale_no,
          customer_code,
          sale_date
        ),
        products (
          item_code,
          name,
          stock
        )
      `)
      .in('id', sale_item_ids)

    if (fetchError || !saleItems || saleItems.length === 0) {
      return NextResponse.json(
        { ok: false, error: '找不到指定的商品明细' },
        { status: 404 }
      )
    }

    // 2. 检查是否已经出货
    const { data: existingDeliveries } = await (supabaseServer
      .from('delivery_items') as any)
      .select(`
        sale_item_id,
        deliveries!inner (
          id,
          status
        )
      `)
      .in('sale_item_id', sale_item_ids)
      .eq('deliveries.status', 'confirmed')

    const alreadyDeliveredIds = new Set(
      existingDeliveries?.map((d: any) => d.sale_item_id) || []
    )

    // 过滤出未出货的商品
    const itemsToDeliver = saleItems.filter(
      (item: any) => !alreadyDeliveredIds.has(item.id)
    )

    if (itemsToDeliver.length === 0) {
      return NextResponse.json(
        { ok: false, error: '所有选中的商品都已出货' },
        { status: 400 }
      )
    }

    // 3. 检查库存是否充足
    const insufficientStock: string[] = []
    for (const item of itemsToDeliver) {
      if (item.products.stock < item.quantity) {
        insufficientStock.push(
          `${item.products.name} (库存: ${item.products.stock}, 需要: ${item.quantity})`
        )
      }
    }

    if (insufficientStock.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '以下商品库存不足：\n' + insufficientStock.join('\n')
        },
        { status: 400 }
      )
    }

    // 4. 按 sale_id 分组（可能有多个销售单）
    const itemsBySale = new Map<string, any[]>()
    for (const item of itemsToDeliver) {
      const saleId = item.sales.id
      if (!itemsBySale.has(saleId)) {
        itemsBySale.set(saleId, [])
      }
      itemsBySale.get(saleId)!.push(item)
    }

    // 5. 为每个销售单创建出货单
    const createdDeliveries: any[] = []
    const errors: string[] = []

    for (const [saleId, items] of itemsBySale.entries()) {
      try {
        // 生成出货单号
        const { data: lastDeliveryArray } = await supabaseServer
          .from('deliveries')
          .select('delivery_no')
          .order('created_at', { ascending: false })
          .limit(1)

        let nextNumber = 1
        if (lastDeliveryArray && lastDeliveryArray.length > 0) {
          const lastDelivery = lastDeliveryArray[0] as { delivery_no: string }
          const match = lastDelivery.delivery_no.match(/\d+/)
          if (match) {
            nextNumber = parseInt(match[0], 10) + 1
          }
        }

        const deliveryNo = `D${String(nextNumber).padStart(4, '0')}`

        // 创建出货单
        const { data: delivery, error: deliveryError } = await (supabaseServer
          .from('deliveries') as any)
          .insert({
            delivery_no: deliveryNo,
            sale_id: saleId,
            delivery_date: new Date().toISOString().split('T')[0],
            status: 'confirmed',
            note: `批量出货 - ${items.length} 个商品`
          })
          .select()
          .single()

        if (deliveryError) {
          errors.push(`销售单 ${items[0].sales.sale_no} 创建出货单失败: ${deliveryError.message}`)
          continue
        }

        // 创建出货明细
        const deliveryItems = items.map((item: any) => ({
          delivery_id: delivery.id,
          sale_item_id: item.id,
          product_id: item.product_id,
          quantity: item.quantity
        }))

        const { error: itemsError } = await (supabaseServer
          .from('delivery_items') as any)
          .insert(deliveryItems)

        if (itemsError) {
          await (supabaseServer.from('deliveries') as any).delete().eq('id', delivery.id)
          errors.push(`销售单 ${items[0].sales.sale_no} 创建出货明细失败: ${itemsError.message}`)
          continue
        }

        // 寫入庫存日誌（trigger 會自動扣除庫存）
        for (const item of items) {
          await (supabaseServer
            .from('inventory_logs') as any)
            .insert({
              product_id: item.product_id,
              ref_type: 'delivery',
              ref_id: delivery.id,
              qty_change: -item.quantity,
              memo: `批量出貨 - ${deliveryNo} (${item.snapshot_name})`
            })
        }

        // 更新 sale 的 fulfillment_status
        const { data: allSaleItems } = await (supabaseServer
          .from('sale_items') as any)
          .select('id')
          .eq('sale_id', saleId)

        const allItemIds = allSaleItems?.map((item: any) => item.id) || []

        const { data: confirmedDeliveryItems } = await (supabaseServer
          .from('delivery_items') as any)
          .select(`
            sale_item_id,
            deliveries!inner (
              status
            )
          `)
          .in('sale_item_id', allItemIds)
          .eq('deliveries.status', 'confirmed')

        const deliveredItemIds = new Set(
          confirmedDeliveryItems?.map((di: any) => di.sale_item_id) || []
        )

        let newFulfillmentStatus = 'none'
        if (deliveredItemIds.size === allItemIds.length) {
          newFulfillmentStatus = 'completed'
        } else if (deliveredItemIds.size > 0) {
          newFulfillmentStatus = 'partial'
        }

        await (supabaseServer
          .from('sales') as any)
          .update({ fulfillment_status: newFulfillmentStatus })
          .eq('id', saleId)

        createdDeliveries.push({
          delivery_no: deliveryNo,
          sale_no: items[0].sales.sale_no,
          item_count: items.length
        })
      } catch (err) {
        console.error('Error creating delivery for sale:', saleId, err)
        errors.push(`销售单处理失败`)
      }
    }

    if (createdDeliveries.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: '批量出货失败：\n' + errors.join('\n')
        },
        { status: 500 }
      )
    }

    const message = `成功出货 ${createdDeliveries.length} 个销售单，共 ${itemsToDeliver.length} 个商品${
      errors.length > 0 ? `\n\n部分失败：\n${errors.join('\n')}` : ''
    }`

    return NextResponse.json({
      ok: true,
      data: {
        deliveries: createdDeliveries,
        total_items: itemsToDeliver.length,
        skipped_items: saleItems.length - itemsToDeliver.length
      },
      message
    })
  } catch (err) {
    console.error('Batch deliver error:', err)
    return NextResponse.json(
      { ok: false, error: '批量出货失败' },
      { status: 500 }
    )
  }
}
