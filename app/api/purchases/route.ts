import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { purchaseDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { generateCode } from '@/lib/utils'

// GET /api/purchases - List purchases with items summary
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const vendorCode = searchParams.get('vendor_code')
    const keyword = searchParams.get('keyword')
    const productKeyword = searchParams.get('product_keyword')

    let query = supabaseServer
      .from('purchases')
      .select(`
        *,
        vendors (
          vendor_name
        ),
        purchase_items (
          id,
          quantity,
          cost,
          product_id,
          products (
            name,
            item_code,
            unit
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (dateFrom) {
      query = query.gte('purchase_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('purchase_date', dateTo)
    }

    if (vendorCode) {
      query = query.eq('vendor_code', vendorCode)
    }

    if (keyword) {
      query = query.or(`purchase_no.ilike.%${keyword}%,vendor_code.ilike.%${keyword}%`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    // Filter by product if needed
    let filteredData = data
    if (productKeyword) {
      filteredData = data?.filter(purchase => {
        const items = purchase.purchase_items || []
        return items.some((item: any) => 
          item.products?.name?.toLowerCase().includes(productKeyword.toLowerCase()) ||
          item.products?.item_code?.toLowerCase().includes(productKeyword.toLowerCase())
        )
      })
    }

    // Calculate summary for each purchase
    const purchasesWithSummary = filteredData?.map(purchase => {
      const items = purchase.purchase_items || []
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      const avgCost = items.length > 0
        ? items.reduce((sum: number, item: any) => sum + item.cost, 0) / items.length
        : 0

      return {
        ...purchase,
        item_count: items.length,
        total_quantity: totalQuantity,
        avg_cost: avgCost,
        purchase_items: items // Keep items for detailed view
      }
    })

    return NextResponse.json({ ok: true, data: purchasesWithSummary })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/purchases - Create purchase
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = purchaseDraftSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const draft = validation.data

    // Verify vendor exists
    const { data: vendor } = await supabaseServer
      .from('vendors')
      .select('id')
      .eq('vendor_code', draft.vendor_code)
      .single()

    if (!vendor) {
      return NextResponse.json(
        { ok: false, error: `Vendor not found: ${draft.vendor_code}` },
        { status: 400 }
      )
    }

    // Generate purchase_no
    const { count } = await supabaseServer
      .from('purchases')
      .select('*', { count: 'exact', head: true })

    const purchaseNo = generateCode('P', count || 0)

    // 1. Create purchase (draft)
    const { data: purchase, error: purchaseError } = await supabaseServer
      .from('purchases')
      .insert({
        purchase_no: purchaseNo,
        vendor_code: draft.vendor_code,
        is_paid: draft.is_paid,
        note: draft.note || null,
        status: 'draft',
        total: 0,
      })
      .select()
      .single()

    if (purchaseError) {
      return NextResponse.json(
        { ok: false, error: purchaseError.message },
        { status: 500 }
      )
    }

    // 2. Insert purchase items (subtotal is auto-calculated by database)
    const purchaseItems = draft.items.map((item) => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      quantity: item.quantity,
      cost: item.cost,
    }))

    const { error: itemsError } = await supabaseServer
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) {
      // Rollback: delete the purchase
      await supabaseServer.from('purchases').delete().eq('id', purchase.id)
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      )
    }

    // 3. Calculate total
    const total = draft.items.reduce((sum, item) => sum + (item.quantity * item.cost), 0)

    // 4. Update purchase to confirmed (database trigger will handle inventory update)
    const { data: confirmedPurchase, error: confirmError } = await supabaseServer
      .from('purchases')
      .update({
        total,
        status: 'confirmed',
      })
      .eq('id', purchase.id)
      .select()
      .single()

    if (confirmError) {
      return NextResponse.json(
        { ok: false, error: confirmError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ok: true, data: confirmedPurchase },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
