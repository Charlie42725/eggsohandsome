import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

type RouteContext = {
    params: Promise<{ id: string }>
}

// GET /api/categories/:id - Get single category
export async function GET(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { id } = await context.params

        const { data, error } = await (supabaseServer
            .from('categories') as any)
            .select('*')
            .eq('id', id)
            .single()

        if (error || !data) {
            return NextResponse.json(
                { ok: false, error: '找不到分類' },
                { status: 404 }
            )
        }

        return NextResponse.json({ ok: true, data })
    } catch (error) {
        console.error('Failed to fetch category:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// PATCH /api/categories/:id - Update category
export async function PATCH(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { id } = await context.params
        const body = await request.json()
        const { name, color, sort_order, is_active } = body

        const updateData: any = {}
        if (name !== undefined) updateData.name = name.trim()
        if (color !== undefined) updateData.color = color
        if (sort_order !== undefined) updateData.sort_order = sort_order
        if (is_active !== undefined) updateData.is_active = is_active

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { ok: false, error: '沒有要更新的資料' },
                { status: 400 }
            )
        }

        const { data, error } = await (supabaseServer
            .from('categories') as any)
            .update(updateData)
            .eq('id', id)
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

        return NextResponse.json({ ok: true, data })
    } catch (error) {
        console.error('Failed to update category:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// DELETE /api/categories/:id - Delete category
export async function DELETE(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { id } = await context.params

        // Check if any products use this category
        const { count } = await (supabaseServer
            .from('products') as any)
            .select('id', { count: 'exact', head: true })
            .eq('category_id', id)

        if (count && count > 0) {
            return NextResponse.json(
                { ok: false, error: `此分類下有 ${count} 個商品，無法刪除。請先移除商品的分類設定。` },
                { status: 400 }
            )
        }

        const { error } = await (supabaseServer
            .from('categories') as any)
            .delete()
            .eq('id', id)

        if (error) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, message: '分類已刪除' })
    } catch (error) {
        console.error('Failed to delete category:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
