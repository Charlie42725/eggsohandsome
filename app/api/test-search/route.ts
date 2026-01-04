import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/test-search - Test product search
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const keyword = searchParams.get('keyword') || 'P0001'

    // Test with active_only=false (like purchases page)
    let query = supabaseServer
      .from('products')
      .select('*')

    const searchPattern = `name.ilike.%${keyword}%,item_code.ilike.%${keyword}%,barcode.ilike.%${keyword}%`

    query = query.or(searchPattern)
    query = query.limit(10)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        details: error,
        searchPattern,
        keyword
      })
    }

    return NextResponse.json({
      ok: true,
      keyword,
      searchPattern,
      resultsCount: data?.length || 0,
      results: data
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    })
  }
}
