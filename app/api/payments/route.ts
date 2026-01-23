import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { settlementSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { updateAccountBalance } from '@/lib/account-service'
import { getTaiwanDateString } from '@/lib/timezone'

// POST /api/payments - Create payment (vendor payment)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Add direction for payment
    const data = {
      ...body,
      partner_type: 'vendor',
      direction: 'payment',
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

    // Verify all accounts are AP
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

      if (account.direction !== 'AP') {
        return NextResponse.json(
          { ok: false, error: 'Can only apply payments to AP accounts' },
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
        account_id: draft.account_id || null,
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
      direction: 'decrease', // 付款 = 現金流出
      transactionType: 'purchase_payment', // 付款給供應商
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

    // 檢查並更新進貨單的 is_paid 狀態
    for (const allocation of draft.allocations) {
      // 查詢這個 AP 記錄對應的進貨單
      const { data: partnerAccount } = await (supabaseServer
        .from('partner_accounts') as any)
        .select('purchase_item_id, ref_id, ref_type, balance')
        .eq('id', allocation.partner_account_id)
        .single()

      if (partnerAccount) {
        let purchaseId: string | null = null

        // 嘗試從 purchase_item_id 找進貨單
        if (partnerAccount.purchase_item_id) {
          const { data: purchaseItem } = await (supabaseServer
            .from('purchase_items') as any)
            .select('purchase_id')
            .eq('id', partnerAccount.purchase_item_id)
            .single()

          if (purchaseItem) {
            purchaseId = purchaseItem.purchase_id
          }
        }
        // 或從 ref_id 找進貨單
        else if (partnerAccount.ref_type === 'purchase') {
          purchaseId = partnerAccount.ref_id
        }

        if (purchaseId) {
          // 檢查這張進貨單的所有 AP 是否都已付清
          const { data: allAPs } = await (supabaseServer
            .from('partner_accounts') as any)
            .select('balance, status')
            .or(`ref_id.eq.${purchaseId},purchase_item_id.in.(select id from purchase_items where purchase_id='${purchaseId}')`)
            .eq('direction', 'AP')

          // 也查詢透過 purchase_item_id 關聯的 AP
          const { data: purchaseItems } = await (supabaseServer
            .from('purchase_items') as any)
            .select('id')
            .eq('purchase_id', purchaseId)

          const itemIds = purchaseItems?.map((i: any) => i.id) || []

          let allPaid = true
          if (itemIds.length > 0) {
            const { data: itemAPs } = await (supabaseServer
              .from('partner_accounts') as any)
              .select('balance, status')
              .in('purchase_item_id', itemIds)
              .eq('direction', 'AP')

            if (itemAPs && itemAPs.length > 0) {
              allPaid = itemAPs.every((ap: any) => ap.status === 'paid' || ap.balance <= 0)
            }
          }

          // 更新進貨單 is_paid 狀態
          if (allPaid) {
            await (supabaseServer
              .from('purchases') as any)
              .update({ is_paid: true })
              .eq('id', purchaseId)
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
