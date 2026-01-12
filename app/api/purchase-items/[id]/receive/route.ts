import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateCode } from '@/lib/utils'

type RouteContext = {
  params: Promise<{ id: string }>
}

// POST /api/purchase-items/:id/receive - 收货指定品项
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { quantity } = body

    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { ok: false, error: '收货数量必须大于 0' },
        { status: 400 }
      )
    }

    // 1. 获取 purchase_item 信息
    const { data: purchaseItem, error: itemError } = await (supabaseServer
      .from('purchase_items') as any)
      .select('*, purchase_id, product_id, quantity, received_quantity')
      .eq('id', id)
      .single()

    if (itemError || !purchaseItem) {
      return NextResponse.json(
        { ok: false, error: '找不到进货明细' },
        { status: 404 }
      )
    }

    // 2. 检查收货数量是否超过进货数量
    const remainingQuantity = purchaseItem.quantity - purchaseItem.received_quantity
    if (quantity > remainingQuantity) {
      return NextResponse.json(
        {
          ok: false,
          error: `收货数量不能超过剩余数量。剩余: ${remainingQuantity}, 尝试收货: ${quantity}`
        },
        { status: 400 }
      )
    }

    // 3. 获取进货单信息
    const { data: purchase } = await (supabaseServer
      .from('purchases') as any)
      .select('purchase_no')
      .eq('id', purchaseItem.purchase_id)
      .single()

    // 4. 查找或创建本次的收货单
    // 查找今天是否已有该进货单的收货记录
    const today = new Date().toISOString().split('T')[0]
    let { data: existingReceiving } = await (supabaseServer
      .from('purchase_receivings') as any)
      .select('id, receiving_no')
      .eq('purchase_id', purchaseItem.purchase_id)
      .gte('receiving_date', `${today}T00:00:00`)
      .lte('receiving_date', `${today}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let receivingId: string
    let receivingNo: string

    if (!existingReceiving) {
      // 创建新的收货单
      // 生成收货单号
      const { data: allReceivings } = await (supabaseServer
        .from('purchase_receivings') as any)
        .select('receiving_no')

      let receivingCount = 0
      if (allReceivings && allReceivings.length > 0) {
        const maxNumber = allReceivings.reduce((max: number, receiving: any) => {
          const match = receiving.receiving_no.match(/\d+/)
          if (match) {
            const num = parseInt(match[0], 10)
            return num > max ? num : max
          }
          return max
        }, 0)
        receivingCount = maxNumber
      }

      receivingNo = generateCode('R', receivingCount)

      // 插入收货单
      const { data: newReceiving, error: receivingError } = await (supabaseServer
        .from('purchase_receivings') as any)
        .insert({
          receiving_no: receivingNo,
          purchase_id: purchaseItem.purchase_id,
          receiving_date: new Date().toISOString(),
          note: `收货：${purchase?.purchase_no}`,
        })
        .select()
        .single()

      if (receivingError) {
        return NextResponse.json(
          { ok: false, error: receivingError.message },
          { status: 500 }
        )
      }

      receivingId = newReceiving.id
    } else {
      receivingId = existingReceiving.id
      receivingNo = existingReceiving.receiving_no
    }

    // 5. 创建收货明细（会触发库存增加和收货数量更新）
    const { data: receivingItem, error: receivingItemError } = await (supabaseServer
      .from('purchase_receiving_items') as any)
      .insert({
        receiving_id: receivingId,
        purchase_item_id: id,
        product_id: purchaseItem.product_id,
        quantity: quantity,
      })
      .select()
      .single()

    if (receivingItemError) {
      return NextResponse.json(
        { ok: false, error: receivingItemError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        data: receivingItem,
        message: `收货成功！收货单号：${receivingNo}`
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Receive purchase item error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
