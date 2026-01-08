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
    const status = searchParams.get('status')

    let query = (supabaseServer
      .from('purchases') as any)
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

    if (status) {
      query = query.eq('status', status)
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
      filteredData = data?.filter((purchase: any) => {
        const items = purchase.purchase_items || []
        return items.some((item: any) => 
          item.products?.name?.toLowerCase().includes(productKeyword.toLowerCase()) ||
          item.products?.item_code?.toLowerCase().includes(productKeyword.toLowerCase())
        )
      })
    }

    // Calculate summary for each purchase
    const purchasesWithSummary = filteredData?.map((purchase: any) => {
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
    const { data: purchase, error: purchaseError } = await (supabaseServer
      .from('purchases') as any)
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

    const { data: insertedItems, error: itemsError } = await (supabaseServer
      .from('purchase_items') as any)
      .insert(purchaseItems)
      .select()

    if (itemsError) {
      // Rollback: delete the purchase
      await (supabaseServer.from('purchases') as any).delete().eq('id', purchase.id)
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      )
    }

    // 3. Calculate total
    const total = draft.items.reduce((sum, item) => sum + (item.quantity * item.cost), 0)

    // 4. Manually update inventory for each item
    // Update stock and avg_cost for each product
    for (const item of insertedItems) {
      // Get current product stock and avg_cost
      const { data: product } = await (supabaseServer
        .from('products') as any)
        .select('stock, avg_cost')
        .eq('id', item.product_id)
        .single()

      if (product) {
        const oldStock = product.stock
        const oldAvgCost = product.avg_cost
        const newStock = oldStock + item.quantity

        // Calculate new average cost using weighted average
        let newAvgCost = oldAvgCost
        if (newStock > 0) {
          newAvgCost = ((oldStock * oldAvgCost) + (item.quantity * item.cost)) / newStock
        }

        // Update product stock and avg_cost
        await (supabaseServer
          .from('products') as any)
          .update({
            stock: newStock,
            avg_cost: newAvgCost,
          })
          .eq('id', item.product_id)

        console.log(`[Purchase ${purchase.id}] Updated inventory for product ${item.product_id}: ${oldStock} -> ${newStock}, avg_cost: ${oldAvgCost.toFixed(2)} -> ${newAvgCost.toFixed(2)}`)
      }
    }

    // 5. Update purchase to confirmed
    const { data: confirmedPurchase, error: confirmError } = await (supabaseServer
      .from('purchases') as any)
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

    // 6. Create accounts payable for each item (if not paid)
    if (!draft.is_paid && insertedItems) {
      const apRecords = insertedItems.map((item: any) => ({
        partner_type: 'vendor',
        partner_code: draft.vendor_code,
        direction: 'AP',
        ref_type: 'purchase',
        ref_id: purchase.id,
        purchase_item_id: item.id,
        amount: item.subtotal,
        received_paid: 0,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        status: 'unpaid',
      }))

      const { error: apError } = await (supabaseServer
        .from('partner_accounts') as any)
        .insert(apRecords)

      if (apError) {
        console.error('Failed to create AP records:', apError)
        // Don't fail the whole transaction, just log the error
      }
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
