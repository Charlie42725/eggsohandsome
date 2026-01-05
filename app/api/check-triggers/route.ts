import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

export async function GET() {
  try {
    // Check for triggers on products and stock_adjustments tables
    const { data: triggers, error } = await supabaseServer.rpc('check_triggers')

    if (error) {
      // If RPC doesn't exist, try direct query
      const query = `
        SELECT
          trigger_name,
          event_object_table,
          action_statement,
          action_timing,
          event_manipulation
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
        AND event_object_table IN ('products', 'stock_adjustments')
        ORDER BY event_object_table, trigger_name;
      `

      return NextResponse.json({
        ok: true,
        note: 'Cannot query triggers directly. Please check Supabase dashboard > Database > Triggers',
        sql_to_run: query,
        message: 'Run this SQL in Supabase SQL Editor to see all triggers'
      })
    }

    return NextResponse.json({ ok: true, triggers })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'Cannot check triggers',
      instruction: 'Please go to Supabase Dashboard > Database > Triggers to check manually'
    })
  }
}
