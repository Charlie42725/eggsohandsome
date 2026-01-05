import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// Debug endpoint to check raw database values
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const itemCode = searchParams.get('item_code') || 'I0528'

    // Get product directly from database
    const { data: product, error } = await supabaseServer
      .from('products')
      .select('*')
      .eq('item_code', itemCode)
      .single()

    if (error) {
      return NextResponse.json({ ok: false, error: error.message })
    }

    // Get any stock adjustments
    const { data: adjustments } = await supabaseServer
      .from('stock_adjustments')
      .select('*')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      ok: true,
      product,
      adjustments: adjustments || [],
      note: 'Direct database query - no processing'
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
