import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { pointProgramSchema } from '@/lib/schemas'
import { fromError } from 'zod-validation-error'

// GET /api/point-programs - 列出所有點數計劃
export async function GET() {
    try {
        const { data, error } = await (supabaseServer
            .from('point_programs') as any)
            .select(`
                *,
                tiers:point_redemption_tiers(*)
            `)
            .order('name', { ascending: true })

        if (error) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, data })
    } catch (error) {
        console.error('Failed to fetch point programs:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// POST /api/point-programs - 建立點數計劃
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const parsed = pointProgramSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: fromError(parsed.error).message },
                { status: 400 }
            )
        }

        const { data, error } = await (supabaseServer
            .from('point_programs') as any)
            .insert(parsed.data)
            .select()
            .single()

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { ok: false, error: '計劃名稱已存在' },
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
        console.error('Failed to create point program:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// PUT /api/point-programs?id=xxx - 更新點數計劃
export async function PUT(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id')
        if (!id) {
            return NextResponse.json(
                { ok: false, error: '缺少計劃ID' },
                { status: 400 }
            )
        }

        const body = await request.json()
        const parsed = pointProgramSchema.partial().safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { ok: false, error: fromError(parsed.error).message },
                { status: 400 }
            )
        }

        const { data, error } = await (supabaseServer
            .from('point_programs') as any)
            .update({ ...parsed.data, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()

        if (error) {
            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({ ok: true, data })
    } catch (error) {
        console.error('Failed to update point program:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
