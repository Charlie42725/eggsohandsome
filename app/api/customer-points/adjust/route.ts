import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { pointAdjustmentSchema } from '@/lib/schemas'
import { fromError } from 'zod-validation-error'
import { getTaiwanTime } from '@/lib/timezone'

// POST /api/customer-points/adjust - 手動調整客戶點數
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const parsed = pointAdjustmentSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: fromError(parsed.error).message },
                { status: 400 }
            )
        }

        const { customer_id, program_id, points, note } = parsed.data

        // 查詢點數計劃
        const { data: program, error: programError } = await (supabaseServer
            .from('point_programs') as any)
            .select('*')
            .eq('id', program_id)
            .single()

        if (programError || !program) {
            return NextResponse.json(
                { ok: false, error: '點數計劃不存在' },
                { status: 404 }
            )
        }

        // 查詢客戶目前點數
        const { data: existingPoints } = await (supabaseServer
            .from('customer_points') as any)
            .select('*')
            .eq('customer_id', customer_id)
            .eq('program_id', program_id)
            .single()

        const currentPoints = existingPoints?.points || 0
        const newPoints = currentPoints + points

        if (newPoints < 0) {
            return NextResponse.json(
                { ok: false, error: `點數不足，目前只有 ${currentPoints} 點` },
                { status: 400 }
            )
        }

        // 計算成本（如果是增加點數，記錄預估成本）
        const costAmount = points > 0 ? points * Number(program.cost_per_point) : 0

        if (existingPoints) {
            // 更新現有點數
            const { error: updateError } = await (supabaseServer
                .from('customer_points') as any)
                .update({
                    points: newPoints,
                    total_earned: points > 0
                        ? existingPoints.total_earned + points
                        : existingPoints.total_earned,
                    estimated_cost: points > 0
                        ? Number(existingPoints.estimated_cost) + costAmount
                        : existingPoints.estimated_cost,
                    updated_at: getTaiwanTime()
                })
                .eq('id', existingPoints.id)

            if (updateError) {
                return NextResponse.json(
                    { ok: false, error: updateError.message },
                    { status: 500 }
                )
            }
        } else {
            // 建立新的點數記錄
            const { error: insertError } = await (supabaseServer
                .from('customer_points') as any)
                .insert({
                    customer_id,
                    program_id,
                    points: newPoints,
                    total_earned: points > 0 ? points : 0,
                    total_redeemed: 0,
                    estimated_cost: costAmount
                })

            if (insertError) {
                return NextResponse.json(
                    { ok: false, error: insertError.message },
                    { status: 500 }
                )
            }
        }

        // 記錄點數日誌
        await (supabaseServer
            .from('point_logs') as any)
            .insert({
                customer_id,
                program_id,
                change_type: 'adjust',
                points_change: points,
                cost_amount: costAmount,
                note: note || `手動調整 ${points > 0 ? '+' : ''}${points} 點`,
                created_at: getTaiwanTime()
            })

        return NextResponse.json({
            ok: true,
            data: {
                previous_points: currentPoints,
                points_adjusted: points,
                new_points: newPoints,
                cost_amount: costAmount
            }
        })
    } catch (error) {
        console.error('Point adjustment error:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
