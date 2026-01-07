import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { createSession, verifyPassword } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()
    console.log('[LOGIN] Attempting login for username:', username)

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: '請輸入帳號和密碼' },
        { status: 400 }
      )
    }

    // Fetch user from database
    const { data: user, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single() as any

    console.log('[LOGIN] Database query error:', error)
    console.log('[LOGIN] User found:', user ? 'Yes' : 'No')
    if (user) {
      console.log('[LOGIN] User role:', user.role)
      console.log('[LOGIN] User is_active:', user.is_active)
    }

    if (error || !user) {
      console.log('[LOGIN] User not found or error')
      return NextResponse.json(
        { ok: false, error: '帳號或密碼錯誤' },
        { status: 401 }
      )
    }

    // Verify password
    console.log('[LOGIN] Verifying password...')
    const isValid = await verifyPassword(password, user.password_hash)
    console.log('[LOGIN] Password valid:', isValid)

    if (!isValid) {
      console.log('[LOGIN] Invalid password')
      return NextResponse.json(
        { ok: false, error: '帳號或密碼錯誤' },
        { status: 401 }
      )
    }

    // Create session
    await createSession(user.id)

    // Return user data (without password hash)
    return NextResponse.json({
      ok: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { ok: false, error: '登入失敗' },
      { status: 500 }
    )
  }
}
