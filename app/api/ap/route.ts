import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/ap - List accounts payable
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const vendorCode = searchParams.get('vendor_code')
    const status = searchParams.get('status')
    const dueBefore = searchParams.get('due_before')

    let query = supabaseServer
      .from('partner_accounts')
      .select('*')
      .eq('partner_type', 'vendor')
      .eq('direction', 'AP')
      .order('created_at', { ascending: false })

    if (vendorCode) {
      query = query.eq('partner_code', vendorCode)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (dueBefore) {
      query = query.lte('due_date', dueBefore)
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
