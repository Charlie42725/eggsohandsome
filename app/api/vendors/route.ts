import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { vendorSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'

// GET /api/vendors - List vendors
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const active = searchParams.get('active')
    const keyword = searchParams.get('keyword') || ''

    let query = supabaseServer
      .from('vendors')
      .select('*')
      .order('vendor_code', { ascending: true })

    if (active !== null) {
      query = query.eq('is_active', active === 'true')
    }

    // Search by keyword (name, vendor_code, phone, or email)
    if (keyword) {
      query = query.or(`vendor_name.ilike.%${keyword}%,vendor_code.ilike.%${keyword}%,phone.ilike.%${keyword}%,email.ilike.%${keyword}%`)
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

// POST /api/vendors - Create new vendor
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = vendorSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const data = validation.data

    // Check if vendor_code already exists
    const { data: existing } = await supabaseServer
      .from('vendors')
      .select('id')
      .eq('vendor_code', data.vendor_code)
      .single()

    if (existing) {
      return NextResponse.json(
        { ok: false, error: 'Vendor code already exists' },
        { status: 400 }
      )
    }

    // Insert vendor
    const { data: vendor, error } = await supabaseServer
      .from('vendors')
      .insert(data)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data: vendor }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
