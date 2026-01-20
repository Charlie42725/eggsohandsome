import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/categories - List all categories
export async function GET() {
    try {
        const { data, error } = await (supabaseServer
            .from('categories') as any)
            .select('*')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true })

        if (error) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, data })
    } catch (error) {
        console.error('Failed to fetch categories:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// POST /api/categories - Create new category
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { name, color, sort_order } = body

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json(
                { ok: false, error: '分類名稱不能為空' },
                { status: 400 }
            )
        }

        const { data, error } = await (supabaseServer
            .from('categories') as any)
            .insert({
                name: name.trim(),
                color: color || '#3B82F6',
                sort_order: sort_order || 0,
            })
            .select()
            .single()

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { ok: false, error: '分類名稱已存在' },
                    { status: 400 }
                )
            }
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, data }, { status: 201 })
    } catch (error) {
        console.error('Failed to create category:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
