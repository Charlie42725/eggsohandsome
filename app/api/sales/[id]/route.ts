import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET /api/sales/:id - Get sale details with items
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // Get sale
    const { data: sale, error: saleError } = await supabaseServer
      .from('sales')
      .select('*')
      .eq('id', id)
      .single()

    if (saleError) {
      return NextResponse.json(
        { ok: false, error: 'Sale not found' },
        { status: 404 }
      )
    }

    // Get sale items with product details
    const { data: items, error: itemsError } = await supabaseServer
      .from('sale_items')
      .select(`
        *,
        products:product_id (
          id,
          item_code,
          name,
          unit
        )
      `)
      .eq('sale_id', id)

    if (itemsError) {
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...sale,
        items,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/sales/:id - Cancel/delete sale
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // Check if sale exists and get its status
    const { data: sale, error: fetchError } = await supabaseServer
      .from('sales')
      .select('status')
      .eq('id', id)
      .single()

    if (fetchError || !sale) {
      return NextResponse.json(
        { ok: false, error: 'Sale not found' },
        { status: 404 }
      )
    }

    // If confirmed, change to cancelled first (triggers rollback in DB)
    if (sale.status === 'confirmed') {
      const { error: cancelError } = await supabaseServer
        .from('sales')
        .update({ status: 'cancelled' })
        .eq('id', id)

      if (cancelError) {
        return NextResponse.json(
          { ok: false, error: cancelError.message },
          { status: 500 }
        )
      }
    }

    // Delete sale items
    await supabaseServer.from('sale_items').delete().eq('sale_id', id)

    // Delete sale
    const { error: deleteError } = await supabaseServer
      .from('sales')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
