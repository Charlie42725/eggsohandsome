import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { settlementSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { updateAccountBalance } from '@/lib/account-service'
import { getTaiwanDateString } from '@/lib/timezone'

// POST /api/receipts - Create receipt (customer payment)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Add direction for receipt
    const data = {
      ...body,
      partner_type: 'customer',
      direction: 'receipt',
    }

    // Validate input
    const validation = settlementSchema.safeParse(data)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const draft = validation.data

    // Verify total amount matches allocations
    const allocationsTotal = draft.allocations.reduce((sum, a) => sum + a.amount, 0)
    if (Math.abs(allocationsTotal - draft.amount) > 0.01) {
      return NextResponse.json(
        { ok: false, error: 'Allocation total does not match settlement amount' },
        { status: 400 }
      )
    }

    // Verify all accounts are AR
    for (const allocation of draft.allocations) {
      const { data: account } = await (supabaseServer
        .from('partner_accounts') as any)
        .select('direction, balance')
        .eq('id', allocation.partner_account_id)
        .single()

      if (!account) {
        return NextResponse.json(
          { ok: false, error: `Account not found: ${allocation.partner_account_id}` },
          { status: 400 }
        )
      }

      if (account.direction !== 'AR') {
        return NextResponse.json(
          { ok: false, error: 'Can only apply receipts to AR accounts' },
          { status: 400 }
        )
      }

      if (allocation.amount > account.balance) {
        return NextResponse.json(
          { ok: false, error: `Allocation amount exceeds account balance` },
          { status: 400 }
        )
      }
    }

    // Create settlement（使用台灣時間）
    const { data: settlement, error: settlementError } = await (supabaseServer
      .from('settlements') as any)
      .insert({
        partner_type: draft.partner_type,
        partner_code: draft.partner_code,
        trans_date: getTaiwanDateString(),
        direction: draft.direction,
        method: draft.method || 'cash',
        amount: draft.amount,
        note: draft.note || null,
      })
      .select()
      .single()

    if (settlementError) {
      return NextResponse.json(
        { ok: false, error: settlementError.message },
        { status: 500 }
      )
    }

    // 更新帳戶餘額
    const accountId = draft.account_id || null
    const paymentMethod = draft.method || 'cash'

    const accountUpdate = await updateAccountBalance({
      supabase: supabaseServer,
      accountId,
      paymentMethod,
      amount: draft.amount,
      direction: 'increase', // 收款 = 現金流入
      transactionType: 'customer_payment', // 客戶收款
      referenceId: settlement.id,
      note: draft.note
    })

    if (!accountUpdate.success && !accountUpdate.warning) {
      // 更新失敗，回滾 settlement
      await (supabaseServer.from('settlements') as any).delete().eq('id', settlement.id)
      return NextResponse.json(
        { ok: false, error: `更新帳戶失敗: ${accountUpdate.error}` },
        { status: 500 }
      )
    }

    // 儲存 account_id 到 settlement（如果是自動解析的）
    if (accountUpdate.accountId && !draft.account_id) {
      await (supabaseServer.from('settlements') as any)
        .update({ account_id: accountUpdate.accountId })
        .eq('id', settlement.id)
    }

    // Create allocations (trigger will handle updating partner_accounts)
    const { error: allocationsError } = await (supabaseServer
      .from('settlement_allocations') as any)
      .insert(
        draft.allocations.map((a) => ({
          settlement_id: settlement.id,
          partner_account_id: a.partner_account_id,
          amount: a.amount,
        }))
      )

    if (allocationsError) {
      // Rollback settlement
      await (supabaseServer.from('settlements') as any).delete().eq('id', settlement.id)
      return NextResponse.json(
        { ok: false, error: allocationsError.message },
        { status: 500 }
      )
    }

    // 檢查並更新銷售單的 is_paid 狀態
    for (const allocation of draft.allocations) {
      // 查詢這個 AR 記錄對應的銷售單
      const { data: partnerAccount } = await (supabaseServer
        .from('partner_accounts') as any)
        .select('sale_item_id, ref_id, ref_type, balance')
        .eq('id', allocation.partner_account_id)
        .single()

      if (partnerAccount && partnerAccount.ref_type === 'sale') {
        const saleId = partnerAccount.ref_id

        // 檢查這張銷售單的所有 AR 是否都已付清
        const { data: allARs } = await (supabaseServer
          .from('partner_accounts') as any)
          .select('balance, status')
          .eq('ref_id', saleId)
          .eq('ref_type', 'sale')
          .eq('direction', 'AR')

        if (allARs && allARs.length > 0) {
          // 檢查所有 AR 是否都已付清（balance <= 0 或 status === 'paid'）
          const allPaid = allARs.every((ar: any) => ar.status === 'paid' || ar.balance <= 0)

          if (allPaid) {
            // 更新銷售單 is_paid 狀態
            await (supabaseServer
              .from('sales') as any)
              .update({ is_paid: true })
              .eq('id', saleId)

            console.log(`[Receipts API] 銷售單 ${saleId} 所有 AR 已付清，更新 is_paid = true`)
          }
        }
      }
    }

    return NextResponse.json({ ok: true, data: settlement }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
