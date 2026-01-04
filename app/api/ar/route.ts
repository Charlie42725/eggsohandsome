import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/ar - List accounts receivable
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const customerCode = searchParams.get('customer_code')
    const status = searchParams.get('status')
    const dueBefore = searchParams.get('due_before')
    const keyword = searchParams.get('keyword')

    let query = supabaseServer
      .from('partner_accounts')
      .select('*')
      .eq('partner_type', 'customer')
      .eq('direction', 'AR')
      .order('created_at', { ascending: false })

    if (customerCode) {
      query = query.eq('partner_code', customerCode)
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

    // Fetch customer details separately
    const customerCodes = [...new Set(accounts?.map(a => a.partner_code) || [])]
    const { data: customers } = await supabaseServer
      .from('customers')
      .select('customer_code, customer_name')
      .in('customer_code', customerCodes)

    // Map customer names to accounts
    const customersMap = new Map(
      customers?.map(c => [c.customer_code, c]) || []
    )

    const accountsWithCustomers = accounts?.map(account => ({
      ...account,
      customers: customersMap.get(account.partner_code) || null
    }))

    return NextResponse.json({ ok: true, data: accountsWithCustomers })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
