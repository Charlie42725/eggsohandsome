import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/customer-points?customer_id=xxx - 查詢客戶所有點數
export async function GET(request: NextRequest) {
    try {
        const customerId = request.nextUrl.searchParams.get('customer_id')

        if (!customerId) {
            return NextResponse.json(
                { ok: false, error: '缺少客戶ID' },
                { status: 400 }
            )
        }

        // 查詢客戶所有點數計劃的餘額
        const { data, error } = await (supabaseServer
            .from('customer_points') as any)
            .select(`
                *,
                program:point_programs(
                    *,
                    tiers:point_redemption_tiers(*)
                )
            `)
            .eq('customer_id', customerId)

        if (error) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        // 取得所有點數計劃，補齊客戶沒有的計劃（顯示0點）
        const { data: allPrograms } = await (supabaseServer
            .from('point_programs') as any)
            .select(`
                *,
                tiers:point_redemption_tiers(*)
            `)
            .eq('is_active', true)

        const existingProgramIds = new Set(data?.map((cp: any) => cp.program_id) || [])
        const result = [...(data || [])]

        // 為沒有紀錄的計劃添加預設值
        for (const program of (allPrograms || [])) {
            if (!existingProgramIds.has(program.id)) {
                result.push({
                    id: null,
                    customer_id: customerId,
                    program_id: program.id,
                    points: 0,
                    total_earned: 0,
                    total_redeemed: 0,
                    estimated_cost: 0,
                    program
                })
            }
        }

        return NextResponse.json({ ok: true, data: result })
    } catch (error) {
        console.error('Failed to fetch customer points:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
