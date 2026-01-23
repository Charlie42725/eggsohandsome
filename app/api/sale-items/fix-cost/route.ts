import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// POST /api/sale-items/fix-cost - 批量更新成本為 0 的 sale_items
export async function POST(request: NextRequest) {
  try {
    // 1. 找出所有成本為 0 或 null 的 sale_items
    const { data: itemsToFix, error: fetchError } = await (supabaseServer
      .from('sale_items') as any)
      .select('id, product_id, cost')
      .or('cost.is.null,cost.eq.0')

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      )
    }

    if (!itemsToFix || itemsToFix.length === 0) {
      return NextResponse.json({
        ok: true,
        message: '沒有需要更新的記錄',
        updated: 0,
      })
    }

    // 2. 取得所有相關商品的成本
    const productIds = [...new Set(itemsToFix.map((item: any) => item.product_id))]

    const { data: products, error: productError } = await (supabaseServer
      .from('products') as any)
      .select('id, avg_cost, cost')
      .in('id', productIds)

    if (productError) {
      return NextResponse.json(
        { ok: false, error: productError.message },
        { status: 500 }
      )
    }

    // 建立商品成本 map
    const productCostMap = new Map<string, number>()
    products?.forEach((p: any) => {
      const cost = p.avg_cost || p.cost || 0
      productCostMap.set(p.id, cost)
    })

    // 3. 批量更新 sale_items
    let updatedCount = 0
    let skippedCount = 0
    const errors: string[] = []

    for (const item of itemsToFix) {
      const newCost = productCostMap.get(item.product_id)

      if (!newCost || newCost === 0) {
        skippedCount++
        continue
      }

      const { error: updateError } = await (supabaseServer
        .from('sale_items') as any)
        .update({ cost: newCost })
        .eq('id', item.id)

      if (updateError) {
        errors.push(`${item.id}: ${updateError.message}`)
      } else {
        updatedCount++
      }
    }

    return NextResponse.json({
      ok: true,
      message: `更新完成`,
      total: itemsToFix.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } catch (error: any) {
    console.error('Failed to fix sale_items cost:', error)
    return NextResponse.json(
      { ok: false, error: error.message || '更新失敗' },
      { status: 500 }
    )
  }
}

// GET /api/sale-items/fix-cost - 預覽需要更新的記錄
export async function GET(request: NextRequest) {
  try {
    // 找出所有成本為 0 或 null 的 sale_items
    const { data: itemsToFix, error: fetchError } = await (supabaseServer
      .from('sale_items') as any)
      .select(`
        id,
        product_id,
        cost,
        quantity,
        price,
        snapshot_name,
        sales!inner (
          sale_no,
          sale_date
        )
      `)
      .or('cost.is.null,cost.eq.0')
      .order('created_at', { ascending: false })
      .limit(100)

    if (fetchError) {
      return NextResponse.json(
        { ok: false, error: fetchError.message },
        { status: 500 }
      )
    }

    // 取得總數
    const { count } = await (supabaseServer
      .from('sale_items') as any)
      .select('id', { count: 'exact', head: true })
      .or('cost.is.null,cost.eq.0')

    return NextResponse.json({
      ok: true,
      total: count || 0,
      preview: itemsToFix?.slice(0, 20) || [],
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || '查詢失敗' },
      { status: 500 }
    )
  }
}
