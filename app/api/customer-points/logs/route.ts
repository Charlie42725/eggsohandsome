import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/customer-points/logs?customer_id=xxx - 查詢客戶點數變動日誌
export async function GET(request: NextRequest) {
    try {
        const customerId = request.nextUrl.searchParams.get('customer_id')
        const programId = request.nextUrl.searchParams.get('program_id')

        if (!customerId) {
            return NextResponse.json(
                { ok: false, error: '缺少客戶ID' },
                { status: 400 }
            )
        }

        let query = (supabaseServer
            .from('point_logs') as any)
            .select(`
                *,
                program:point_programs(name),
                tier:point_redemption_tiers(points_required, reward_value)
            `)
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })

        if (programId) {
            query = query.eq('program_id', programId)
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
        console.error('Failed to fetch point logs:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
