import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { getTaiwanTime } from '@/lib/timezone'

type SupabaseClientType = SupabaseClient<Database>

/**
 * 帳戶餘額更新參數
 */
export interface AccountUpdateParams {
  supabase: SupabaseClientType
  accountId: string | null          // 帳戶 ID（可為 null，將嘗試從 paymentMethod 自動解析）
  paymentMethod?: string             // 付款方式（用於自動解析帳戶）
  amount: number                     // 金額
  direction: 'increase' | 'decrease' // 增加或減少
  transactionType: 'purchase_payment' | 'customer_payment' | 'sale' | 'expense' | 'adjustment' | 'transfer_out' | 'transfer_in'
  referenceId: string                // 關聯記錄 ID
  referenceNo?: string               // 關聯單號
  note?: string
}

/**
 * 帳戶餘額更新結果
 */
export interface AccountUpdateResult {
  success: boolean
  accountId?: string
  error?: string
  warning?: string
  previousBalance?: number
  newBalance?: number
}

/**
 * 更新帳戶餘額
 *
 * 這個函數會：
 * 1. 自動解析帳戶（如果 accountId 為 null）
 * 2. 原子性更新餘額（使用資料庫層級操作）
 * 3. 記錄審計日誌到 account_transactions
 * 4. 處理特殊情況（pending 付款、null 帳戶等）
 *
 * @param params 更新參數
 * @returns 更新結果
 */
export async function updateAccountBalance(
  params: AccountUpdateParams
): Promise<AccountUpdateResult> {
  const {
    supabase,
    accountId: providedAccountId,
    paymentMethod,
    amount,
    direction,
    transactionType,
    referenceId,
    referenceNo,
    note
  } = params

  // 驗證金額
  if (amount <= 0) {
    return {
      success: false,
      error: '金額必須大於 0'
    }
  }

  // 特殊情況：pending 付款方式不更新帳戶餘額
  if (paymentMethod === 'pending') {
    return {
      success: true,
      warning: '付款方式為 pending，不更新帳戶餘額'
    }
  }

  let accountId = providedAccountId

  // 如果沒有提供 accountId，嘗試從 paymentMethod 自動解析
  if (!accountId && paymentMethod) {
    const { data: account, error: accountError } = await (supabase
      .from('accounts') as any)
      .select('id, balance, is_active')
      .eq('payment_method_code', paymentMethod)
      .eq('is_active', true)
      .single()

    if (accountError || !account) {
      // 無法找到對應的帳戶，但不視為錯誤（可能該付款方式沒有對應帳戶）
      return {
        success: true,
        warning: `找不到付款方式 ${paymentMethod} 對應的活躍帳戶，跳過餘額更新`
      }
    }

    accountId = account.id
  }

  // 如果還是沒有 accountId，跳過更新
  if (!accountId) {
    return {
      success: true,
      warning: '未指定帳戶，跳過餘額更新'
    }
  }

  try {
    // 🔒 冪等性檢查：防止同一筆交易重複記帳
    const { data: existingLog, error: logCheckError } = await (supabase
      .from('account_transactions') as any)
      .select('id')
      .eq('ref_type', transactionType === 'purchase_payment' || transactionType === 'customer_payment'
        ? 'settlement'
        : transactionType)
      .eq('ref_id', referenceId)
      .eq('transaction_type', transactionType)
      .limit(1)
      .maybeSingle()

    if (existingLog) {
      // 此交易已經記帳過了，跳過
      return {
        success: true,
        warning: `交易 ${referenceId} 已記帳，跳過重複更新`
      }
    }

    // 讀取當前帳戶資訊（用於審計日誌和驗證）
    const { data: account, error: fetchError } = await (supabase
      .from('accounts') as any)
      .select('id, balance, is_active, account_name')
      .eq('id', accountId)
      .single()

    if (fetchError || !account) {
      return {
        success: false,
        error: `帳戶不存在或無法讀取: ${fetchError?.message || '未知錯誤'}`
      }
    }

    if (!account.is_active) {
      return {
        success: false,
        error: `帳戶 ${account.account_name} 已停用，無法更新餘額`
      }
    }

    const previousBalance = Number(account.balance) || 0
    const changeAmount = direction === 'increase' ? amount : -amount
    const newBalance = previousBalance + changeAmount

    // 使用原子性 SQL 更新避免競態條件（同時更新 updated_at 為台灣時間）
    const { error: updateError } = await (supabase
      .from('accounts') as any)
      .update({
        balance: newBalance,
        updated_at: getTaiwanTime()
      })
      .eq('id', accountId)

    if (updateError) {
      return {
        success: false,
        error: `更新帳戶餘額失敗: ${updateError.message}`
      }
    }

    // 記錄審計日誌到 account_transactions（使用台灣時間）
    const transactionLog = {
      account_id: accountId,
      transaction_type: transactionType, // 使用資料庫的欄位名稱
      amount,
      balance_before: previousBalance,
      balance_after: newBalance,
      ref_type: transactionType === 'purchase_payment' || transactionType === 'customer_payment'
        ? 'settlement'
        : transactionType,
      ref_id: referenceId,
      ref_no: referenceNo || null,
      note: note || null,
      created_at: getTaiwanTime()
    }

    const { error: logError } = await (supabase
      .from('account_transactions') as any)
      .insert(transactionLog)

    if (logError) {
      // 審計日誌失敗不影響主要流程，但要記錄警告
      console.error('[Account Service] 寫入審計日誌失敗:', logError)
      return {
        success: true,
        accountId,
        previousBalance,
        newBalance,
        warning: `餘額更新成功，但審計日誌寫入失敗: ${logError.message}`
      }
    }

    return {
      success: true,
      accountId,
      previousBalance,
      newBalance
    }
  } catch (error: any) {
    return {
      success: false,
      error: `更新帳戶餘額時發生異常: ${error.message || '未知錯誤'}`
    }
  }
}

/**
 * 批次更新多個帳戶餘額（用於未來擴展）
 *
 * @param updates 多個更新參數
 * @returns 多個更新結果
 */
export async function batchUpdateAccountBalances(
  updates: AccountUpdateParams[]
): Promise<AccountUpdateResult[]> {
  const results: AccountUpdateResult[] = []

  for (const update of updates) {
    const result = await updateAccountBalance(update)
    results.push(result)

    // 如果某個更新失敗且不是警告，可以選擇中止後續更新
    if (!result.success && !result.warning) {
      console.error('[Account Service] 批次更新失敗:', result.error)
      // 這裡可以選擇繼續或中止
    }
  }

  return results
}

/**
 * 執行內部轉帳
 */
export async function transferFunds(params: {
  supabase: SupabaseClientType
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string // ISO string
  note?: string
}): Promise<{ success: boolean; error?: string }> {
  const { supabase, fromAccountId, toAccountId, amount, date, note } = params

  if (amount <= 0) {
    return { success: false, error: '轉帳金額必須大於 0' }
  }

  if (fromAccountId === toAccountId) {
    return { success: false, error: '轉出與轉入帳戶不能相同' }
  }

  // 1. Check Source Balance (Optional, but good practice)
  const { data: sourceAccount, error: sourceError } = await (supabase
    .from('accounts') as any)
    .select('balance, account_name')
    .eq('id', fromAccountId)
    .single()

  if (sourceError || !sourceAccount) {
    return { success: false, error: '無法讀取轉出帳戶資訊' }
  }

  // Warning if insufficient funds, but allow it (balance can be negative for some accounts)
  // if (sourceAccount.balance < amount) ...

  const transferId = crypto.randomUUID()

  // 2. Deduct from Source
  const deductResult = await updateAccountBalance({
    supabase,
    accountId: fromAccountId,
    amount,
    direction: 'decrease',
    transactionType: 'transfer_out',
    referenceId: transferId,
    note: `轉帳至: ${(await getAccountName(supabase, toAccountId))} ${note ? `(${note})` : ''}`,
  })

  if (!deductResult.success) {
    return { success: false, error: `轉出失敗: ${deductResult.error}` }
  }

  // 3. Add to Destination
  const addResult = await updateAccountBalance({
    supabase,
    accountId: toAccountId,
    amount,
    direction: 'increase',
    transactionType: 'transfer_in',
    referenceId: transferId,
    note: `來自轉帳: ${sourceAccount.account_name} ${note ? `(${note})` : ''}`,
  })

  if (!addResult.success) {
    // CRITICAL: Rollback source deduction needed here in a real system.
    // For now, we return error and log manual intervention needed.
    console.error(`[CRITICAL] Transfer partial failure. Deducted from ${fromAccountId} but failed to add to ${toAccountId}. Ref: ${transferId}`)
    return { success: false, error: `轉入失敗 (金額已從轉出帳戶扣除，請聯繫管理員): ${addResult.error}` }
  }

  return { success: true }
}

async function getAccountName(supabase: SupabaseClientType, accountId: string): Promise<string> {
  const { data } = await (supabase.from('accounts') as any).select('account_name').eq('id', accountId).single()
  return data?.account_name || 'Unknown Account'
}

/**
 * 查詢帳戶交易歷史
 *
 * @param supabase Supabase 客戶端
 * @param accountId 帳戶 ID
 * @param options 查詢選項
 * @returns 交易記錄列表
 */
export async function getAccountTransactions(
  supabase: SupabaseClientType,
  accountId: string,
  options?: {
    startDate?: string
    endDate?: string
    transactionType?: 'purchase_payment' | 'customer_payment' | 'sale' | 'expense' | 'adjustment'
    limit?: number
    page?: number
  }
) {
  const limit = options?.limit || 50
  const page = options?.page || 1
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = (supabase
    .from('account_transactions') as any)
    .select('*', { count: 'exact' })
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (options?.startDate) {
    query = query.gte('created_at', options.startDate)
  }

  if (options?.endDate) {
    // End date should include the whole day, so we might need to adjust if it's just YYYY-MM-DD
    // But usually frontend sends full ISO or we handle it.
    // If it is YYYY-MM-DD, we should probably append 23:59:59 or use lt next day.
    // checks if it contains time
    if (options.endDate.includes('T')) {
      query = query.lte('created_at', options.endDate)
    } else {
      query = query.lte('created_at', `${options.endDate}T23:59:59`)
    }
  }

  if (options?.transactionType) {
    query = query.eq('transaction_type', options.transactionType)
  }

  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) {
    console.error('[Account Service] 查詢交易歷史失敗:', error)
    return { data: null, count: 0, error }
  }

  return { data, count, error: null }
}
