import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { getTaiwanTime } from '@/lib/timezone'

// POST /api/accounts/reorder - 更新帳戶排序
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountIds } = body

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: '請提供帳戶 ID 陣列' },
        { status: 400 }
      )
    }

    // 批次更新每個帳戶的 sort_order
    const updates = accountIds.map((id: string, index: number) => ({
      id,
      sort_order: index + 1,
      updated_at: getTaiwanTime(),
    }))

    // 逐一更新（Supabase 不支援批次 upsert 時只更新部分欄位）
    for (const update of updates) {
      const { error } = await (supabaseServer.from('accounts') as any)
        .update({
          sort_order: update.sort_order,
          updated_at: update.updated_at,
        })
        .eq('id', update.id)

      if (error) {
        console.error(`Failed to update account ${update.id}:`, error)
        return NextResponse.json(
          { ok: false, error: `更新帳戶排序失敗: ${error.message}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ ok: true, message: '排序更新成功' })
  } catch (error) {
    console.error('Reorder accounts error:', error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
