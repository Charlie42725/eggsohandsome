import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { pointRedemptionSchema } from '@/lib/schemas'
import { fromError } from 'zod-validation-error'
import { getTaiwanTime } from '@/lib/timezone'

// POST /api/customer-points/redeem - 兌換點數為購物金
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const parsed = pointRedemptionSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: fromError(parsed.error).message },
                { status: 400 }
            )
        }

        const { customer_id, program_id, tier_id, note } = parsed.data

        // 1. 查詢兌換方案
        const { data: tier, error: tierError } = await (supabaseServer
            .from('point_redemption_tiers') as any)
            .select('*, program:point_programs(*)')
            .eq('id', tier_id)
            .eq('program_id', program_id)
            .eq('is_active', true)
            .single()

        if (tierError || !tier) {
            return NextResponse.json(
                { ok: false, error: '兌換方案不存在或已停用' },
                { status: 404 }
            )
        }

        // 2. 查詢客戶目前點數
        const { data: customerPoints, error: pointsError } = await (supabaseServer
            .from('customer_points') as any)
            .select('*')
            .eq('customer_id', customer_id)
            .eq('program_id', program_id)
            .single()

        if (pointsError || !customerPoints || customerPoints.points < tier.points_required) {
            const currentPoints = customerPoints?.points || 0
            return NextResponse.json(
                { ok: false, error: `點數不足，需要 ${tier.points_required} 點，目前只有 ${currentPoints} 點` },
                { status: 400 }
            )
        }

        // 3. 查詢客戶資料
        const { data: customer, error: customerError } = await (supabaseServer
            .from('customers') as any)
            .select('id, customer_code, customer_name, store_credit')
            .eq('id', customer_id)
            .single()

        if (customerError || !customer) {
            return NextResponse.json(
                { ok: false, error: '客戶不存在' },
                { status: 404 }
            )
        }

        const newPoints = customerPoints.points - tier.points_required
        const newTotalRedeemed = customerPoints.total_redeemed + tier.points_required
        const balanceBefore = customer.store_credit || 0
        const balanceAfter = balanceBefore + Number(tier.reward_value)

        // 計算實際成本（兌換時調整成本）
        // 預估成本是按每點 cost_per_point 計算的，實際成本是 reward_value
        const estimatedCostForRedeemed = tier.points_required * Number(tier.program.cost_per_point)
        const actualCost = Number(tier.reward_value)
        const costAdjustment = actualCost - estimatedCostForRedeemed
        const newEstimatedCost = customerPoints.estimated_cost - estimatedCostForRedeemed

        // 4. 更新客戶點數
        const { error: updatePointsError } = await (supabaseServer
            .from('customer_points') as any)
            .update({
                points: newPoints,
                total_redeemed: newTotalRedeemed,
                estimated_cost: Math.max(0, newEstimatedCost),
                updated_at: getTaiwanTime()
            })
            .eq('id', customerPoints.id)

        if (updatePointsError) {
            return NextResponse.json(
                { ok: false, error: updatePointsError.message },
                { status: 500 }
            )
        }

        // 5. 更新客戶購物金餘額
        const { error: updateCreditError } = await (supabaseServer
            .from('customers') as any)
            .update({ store_credit: balanceAfter })
            .eq('id', customer_id)

        if (updateCreditError) {
            // 回滾點數
            await (supabaseServer
                .from('customer_points') as any)
                .update({
                    points: customerPoints.points,
                    total_redeemed: customerPoints.total_redeemed,
                    estimated_cost: customerPoints.estimated_cost
                })
                .eq('id', customerPoints.id)

            return NextResponse.json(
                { ok: false, error: updateCreditError.message },
                { status: 500 }
            )
        }

        // 6. 記錄購物金變動
        await (supabaseServer
            .from('customer_balance_logs') as any)
            .insert({
                customer_code: customer.customer_code,
                amount: Number(tier.reward_value),
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                type: 'recharge',
                ref_type: 'point_redemption',
                note: `兌換${tier.program.name}點數 ${tier.points_required}點 → $${tier.reward_value}`,
                created_at: getTaiwanTime()
            })

        // 7. 記錄點數變動日誌
        const { data: pointLog, error: logError } = await (supabaseServer
            .from('point_logs') as any)
            .insert({
                customer_id,
                program_id,
                change_type: 'redeem',
                points_change: -tier.points_required,
                cost_amount: actualCost,  // 記錄實際成本
                reward_value: tier.reward_value,
                tier_id,
                note: note || `兌換 ${tier.points_required} 點為購物金 $${tier.reward_value}`,
                created_at: getTaiwanTime()
            })
            .select()
            .single()

        if (logError) {
            console.error('Failed to create point log:', logError)
        }

        return NextResponse.json({
            ok: true,
            data: {
                points_redeemed: tier.points_required,
                reward_value: tier.reward_value,
                new_points: newPoints,
                new_store_credit: balanceAfter,
                actual_cost: actualCost,
                cost_adjustment: costAdjustment,
                log: pointLog
            }
        })
    } catch (error) {
        console.error('Point redemption error:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
