import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// GET /api/test-db - Test database connection
export async function GET() {
  try {
    // Test 1: Count all products
    const { count, error: countError } = await supabaseServer
      .from('products')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      return NextResponse.json({
        ok: false,
        error: 'Count error: ' + countError.message,
        details: countError
      })
    }

    // Test 2: Get all products
    const { data, error } = await supabaseServer
      .from('products')
      .select('*')
      .limit(10)

    if (error) {
      return NextResponse.json({
        ok: false,
        error: 'Query error: ' + error.message,
        details: error
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Database connection successful',
      totalProducts: count,
      sampleProducts: data,
      productsCount: data?.length || 0
    })
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: 'Exception: ' + error.message,
      stack: error.stack
    })
  }
}
