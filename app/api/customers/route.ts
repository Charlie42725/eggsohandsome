import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { customerSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'

// GET /api/customers - List customers
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const active = searchParams.get('active')
    const keyword = searchParams.get('keyword') || ''

    let query = supabaseServer
      .from('customers')
      .select('*')
      .order('customer_code', { ascending: true })

    if (active !== null) {
      query = query.eq('is_active', active === 'true')
    }

    // Search by keyword (name, customer_code, phone, or email)
    if (keyword) {
      query = query.or(`customer_name.ilike.%${keyword}%,customer_code.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`)
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

// POST /api/customers - Create new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = customerSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const data = validation.data

    // Check if customer_code already exists
    const { data: existing } = await supabaseServer
      .from('customers')
      .select('id')
      .eq('customer_code', data.customer_code)
      .single()

    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'Customer code already exists' },
        { status: 400 }
      )
    }

    // Insert customer
    const { data: customer, error } = await supabaseServer
      .from('customers')
      .insert(data)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data: customer }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
