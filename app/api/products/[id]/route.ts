import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { productUpdateSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET /api/products/:id
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    const { data, error } = await supabaseServer
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/products/:id
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    // Validate input
    const validation = productUpdateSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const data = validation.data

    // Update product
    const { data: product, error } = await (supabaseServer
      .from('products') as any)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data: product })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/:id
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // 防呆機制 1: 檢查是否有進貨記錄
    const { count: purchaseCount } = await supabaseServer
      .from('purchase_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)

    if (purchaseCount && purchaseCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `無法刪除：此商品有 ${purchaseCount} 筆進貨記錄`
        },
        { status: 400 }
      )
    }

    // 防呆機制 2: 檢查是否有銷售記錄
    const { count: saleCount } = await supabaseServer
      .from('sale_items')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', id)

    if (saleCount && saleCount > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `無法刪除：此商品有 ${saleCount} 筆銷售記錄`
        },
        { status: 400 }
      )
    }

    // 防呆機制 3: 檢查庫存是否為 0
    const { data: product } = await (supabaseServer
      .from('products') as any)
      .select('stock, name')
      .eq('id', id)
      .single()

    if (product && product.stock !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `無法刪除：「${product.name}」目前庫存為 ${product.stock}，請先清空庫存`
        },
        { status: 400 }
      )
    }

    // 執行刪除
    const { error } = await (supabaseServer
      .from('products') as any)
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, message: '商品已刪除' })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
