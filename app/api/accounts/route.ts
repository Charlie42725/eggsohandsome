import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { accountSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { getTaiwanTime } from '@/lib/timezone'

// GET /api/accounts - 獲取所有帳戶
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = (supabaseServer.from('accounts') as any)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('account_name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
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
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/accounts - 新增帳戶
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 驗證輸入
    const validation = accountSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const account = validation.data

    // 檢查帳戶名稱是否重複
    const { data: existing } = await (supabaseServer.from('accounts') as any)
      .select('id')
      .eq('account_name', account.account_name)
      .single()

    if (existing) {
      return NextResponse.json(
        { ok: false, error: '帳戶名稱已存在' },
        { status: 400 }
      )
    }

    // 獲取目前最大的 sort_order
    const { data: maxOrderResult } = await (supabaseServer.from('accounts') as any)
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single()

    const nextSortOrder = (maxOrderResult?.sort_order ?? 0) + 1

    // 新增帳戶（使用台灣時間）
    const { data, error } = await (supabaseServer.from('accounts') as any)
      .insert({
        account_name: account.account_name,
        account_type: account.account_type,
        // Balance is always 0 on creation now. Adjustments must be made via transaction.
        balance: 0,
        is_active: account.is_active !== false,
        sort_order: nextSortOrder,
        created_at: getTaiwanTime(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
