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
    const { data: customer, error } = await (supabaseServer
      .from('customers') as any)
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

// PUT /api/customers?id=xxx - Update customer
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Customer ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validate input (allow partial updates)
    const validation = customerSchema.partial().safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const data = validation.data

    // If customer_code is being changed, check if new code already exists
    if (data.customer_code) {
      const { data: existing } = await supabaseServer
        .from('customers')
        .select('id')
        .eq('customer_code', data.customer_code)
        .neq('id', id)
        .single()

      if (existing) {
        return NextResponse.json(
          { ok: false, error: 'Customer code already exists' },
          { status: 400 }
        )
      }
    }

    // Update customer
    const { data: customer, error } = await (supabaseServer
      .from('customers') as any)
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data: customer })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers?id=xxx - Delete customer
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Customer ID is required' },
        { status: 400 }
      )
    }

    // Check if customer has related sales
    const { data: sales } = await (supabaseServer
      .from('sales') as any)
      .select('id')
      .eq('customer_code', (await (supabaseServer.from('customers') as any).select('customer_code').eq('id', id).single()).data?.customer_code)
      .limit(1)

    if (sales && sales.length > 0) {
      return NextResponse.json(
        { ok: false, error: '此客戶有關聯的銷售記錄，無法刪除' },
        { status: 400 }
      )
    }

    // Delete customer
    const { error } = await supabaseServer
      .from('customers')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
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
