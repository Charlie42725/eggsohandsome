import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { getAccountTransactions } from '@/lib/account-service'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 20
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : 1
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const transactionType = searchParams.get('transactionType') as any

    // Use supabaseServer directly as it is the initialized client in this project
    const { data, count, error } = await getAccountTransactions(supabaseServer, id, {
        limit,
        page,
        startDate,
        endDate,
        transactionType: transactionType || undefined
    })

    if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // 補充客戶/廠商資訊
    const enrichedData = await Promise.all((data || []).map(async (tx: any) => {
        let partnerName = null
        let partnerCode = null

        if (tx.ref_type === 'sale' && tx.ref_id) {
            // 查詢銷售單的客戶
            const { data: sale } = await (supabaseServer
                .from('sales') as any)
                .select('customer_code, customers:customer_code(customer_name)')
                .eq('id', tx.ref_id)
                .single()

            if (sale) {
                partnerCode = sale.customer_code
                partnerName = sale.customers?.customer_name || null
            }
        } else if (tx.ref_type === 'purchase' && tx.ref_id) {
            // 查詢進貨單的廠商
            const { data: purchase } = await (supabaseServer
                .from('purchases') as any)
                .select('vendor_code, vendors:vendor_code(vendor_name)')
                .eq('id', tx.ref_id)
                .single()

            if (purchase) {
                partnerCode = purchase.vendor_code
                partnerName = purchase.vendors?.vendor_name || null
            }
        } else if (tx.ref_type === 'settlement' && tx.ref_id) {
            // 查詢收款/付款記錄的客戶/廠商
            const { data: settlement } = await (supabaseServer
                .from('settlements') as any)
                .select('partner_type, partner_code')
                .eq('id', tx.ref_id)
                .single()

            if (settlement) {
                partnerCode = settlement.partner_code
                if (settlement.partner_type === 'customer') {
                    const { data: customer } = await (supabaseServer
                        .from('customers') as any)
                        .select('customer_name')
                        .eq('customer_code', settlement.partner_code)
                        .single()
                    partnerName = customer?.customer_name || null
                } else if (settlement.partner_type === 'vendor') {
                    const { data: vendor } = await (supabaseServer
                        .from('vendors') as any)
                        .select('vendor_name')
                        .eq('vendor_code', settlement.partner_code)
                        .single()
                    partnerName = vendor?.vendor_name || null
                }
            }
        }

        return {
            ...tx,
            partner_code: partnerCode,
            partner_name: partnerName
        }
    }))

    return NextResponse.json({
        ok: true,
        data: enrichedData,
        meta: {
            total: count,
            page,
            limit,
            totalPages: count ? Math.ceil(count / limit) : 0
        }
    })
}
