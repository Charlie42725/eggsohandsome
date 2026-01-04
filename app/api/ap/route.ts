import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/ap - List accounts payable
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const vendorCode = searchParams.get('vendor_code')
    const status = searchParams.get('status')
    const dueBefore = searchParams.get('due_before')
    const keyword = searchParams.get('keyword')

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

    if (keyword) {
      query = query.ilike('partner_code', `%${keyword}%`)
    }

    const { data: accounts, error } = await query

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    // Fetch vendor details separately
    const vendorCodes = [...new Set((accounts as any[])?.map(a => a.partner_code) || [])]
    const { data: vendors } = await supabaseServer
      .from('vendors')
      .select('vendor_code, vendor_name')
      .in('vendor_code', vendorCodes)

    // Map vendor names to accounts
    const vendorsMap = new Map(
      (vendors as any[])?.map(v => [v.vendor_code, v]) || []
    )

    const accountsWithVendors = (accounts as any[])?.map(account => ({
      ...account,
      vendors: vendorsMap.get(account.partner_code) || null
    }))

    return NextResponse.json({ ok: true, data: accountsWithVendors })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
