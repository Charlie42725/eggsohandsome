import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { ichibanKujiDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'

// GET /api/ichiban-kuji - List all ichiban kuji
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const active = searchParams.get('active')

    let query = (supabaseServer
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
            unit
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (active !== null) {
      query = query.eq('is_active', active === 'true')
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
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

// POST /api/ichiban-kuji - Create new ichiban kuji
export async function POST(request: NextRequest) {
  try {
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

    // Create ichiban kuji
    const { data: kuji, error: kujiError } = await (supabaseServer
      .from('ichiban_kuji') as any)
      .insert({
        name: draft.name,
        barcode: draft.barcode || null,
        price: draft.price,
        total_draws: totalDraws,
        avg_cost: avgCost,
        combo_prices: draft.combo_prices || [],
      })
      .select()
      .single()

    if (kujiError) {
      return NextResponse.json(
        { ok: false, error: kujiError.message },
        { status: 500 }
      )
    }

    // Insert prizes
    const prizeInserts = draft.prizes.map(prize => ({
      kuji_id: kuji.id,
      prize_tier: prize.prize_tier,
      product_id: prize.product_id,
      quantity: prize.quantity,
      remaining: prize.quantity, // 初始剩餘數量等於總數量
    }))

    const { error: prizesError } = await (supabaseServer
      .from('ichiban_kuji_prizes') as any)
      .insert(prizeInserts)

    if (prizesError) {
      // Rollback: delete the kuji
      await (supabaseServer.from('ichiban_kuji') as any).delete().eq('id', kuji.id)
      return NextResponse.json(
        { ok: false, error: prizesError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ok: true, data: kuji },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
