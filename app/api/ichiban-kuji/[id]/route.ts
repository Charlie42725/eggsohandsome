import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { ichibanKujiDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'

type RouteContext = {
  params: Promise<{ id: string }>
}

// GET /api/ichiban-kuji/:id - Get single ichiban kuji with prizes
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    const { data: kuji, error } = await (supabaseServer
      .from('ichiban_kuji') as any)
      .select(`
        *,
        ichiban_kuji_prizes (
          id,
          prize_tier,
          product_id,
          quantity,
          remaining,
          products (
            id,
            name,
            item_code,
            barcode,
            cost,
            price,
            stock,
            unit
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'Ichiban kuji not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ ok: true, data: kuji })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/ichiban-kuji/:id - Update ichiban kuji
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    // Validate input
    const validation = ichibanKujiDraftSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const draft = validation.data

    // Calculate total draws and average cost
    let totalDraws = 0
    let totalCost = 0

    // Fetch product costs
    const productIds = draft.prizes.map(p => p.product_id)
    const { data: products } = await (supabaseServer
      .from('products') as any)
      .select('id, cost')
      .in('id', productIds)

    const productCostMap = new Map(
      (products as any[])?.map(p => [p.id, p.cost]) || []
    )

    // Calculate totals
    for (const prize of draft.prizes) {
      const cost = productCostMap.get(prize.product_id) || 0
      totalDraws += prize.quantity
      totalCost += cost * prize.quantity
    }

    const avgCost = totalDraws > 0 ? totalCost / totalDraws : 0

    // Update ichiban kuji
    const { error: updateError } = await (supabaseServer
      .from('ichiban_kuji') as any)
      .update({
        name: draft.name,
        barcode: draft.barcode || null,
        price: draft.price,
        total_draws: totalDraws,
        avg_cost: avgCost,
        combo_prices: draft.combo_prices || [],
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 }
      )
    }

    // Delete old prizes
    await (supabaseServer
      .from('ichiban_kuji_prizes') as any)
      .delete()
      .eq('kuji_id', id)

    // Insert new prizes
    const prizeInserts = draft.prizes.map(prize => ({
      kuji_id: id,
      prize_tier: prize.prize_tier,
      product_id: prize.product_id,
      quantity: prize.quantity,
      remaining: prize.quantity, // 重置剩餘數量等於總數量
    }))

    const { error: prizesError } = await (supabaseServer
      .from('ichiban_kuji_prizes') as any)
      .insert(prizeInserts)

    if (prizesError) {
      return NextResponse.json(
        { ok: false, error: prizesError.message },
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

// DELETE /api/ichiban-kuji/:id - Delete ichiban kuji
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params

    // Delete prizes first (cascade should handle this, but being explicit)
    await (supabaseServer
      .from('ichiban_kuji_prizes') as any)
      .delete()
      .eq('kuji_id', id)

    // Delete kuji
    const { error: deleteError } = await (supabaseServer
      .from('ichiban_kuji') as any)
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
