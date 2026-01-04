import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { saleDraftSchema } from '@/lib/schemas'
import { fromZodError } from 'zod-validation-error'
import { generateCode } from '@/lib/utils'

// GET /api/sales - List sales with items summary
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const customerCode = searchParams.get('customer_code')
    const source = searchParams.get('source')
    const keyword = searchParams.get('keyword')
    const productKeyword = searchParams.get('product_keyword')

    let query = (supabaseServer
      .from('sales') as any)
      .select(`
        *,
        sale_items (
          id,
          quantity,
          price,
          snapshot_name,
          product_id,
          products (
            item_code,
            unit
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (dateFrom) {
      query = query.gte('sale_date', dateFrom)
    }

    if (dateTo) {
      query = query.lte('sale_date', dateTo)
    }

    if (customerCode) {
      query = query.eq('customer_code', customerCode)
    }

    if (source) {
      query = query.eq('source', source)
    }

    if (keyword) {
      query = query.or(`sale_no.ilike.%${keyword}%,customer_code.ilike.%${keyword}%`)
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
      filteredData = data?.filter((sale: any) => {
        const items = sale.sale_items || []
        return items.some((item: any) => 
          item.snapshot_name?.toLowerCase().includes(productKeyword.toLowerCase()) ||
          item.products?.item_code?.toLowerCase().includes(productKeyword.toLowerCase())
        )
      })
    }

    // Calculate summary for each sale
    const salesWithSummary = filteredData?.map((sale: any) => {
      const items = sale.sale_items || []
      const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      const avgPrice = items.length > 0
        ? items.reduce((sum: number, item: any) => sum + item.price, 0) / items.length
        : 0

      return {
        ...sale,
        item_count: items.length,
        total_quantity: totalQuantity,
        avg_price: avgPrice,
        sale_items: items // Keep items for detailed view
      }
    })

    return NextResponse.json({ ok: true, data: salesWithSummary })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/sales - Create sale
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validation = saleDraftSchema.safeParse(body)
    if (!validation.success) {
      const error = fromZodError(validation.error)
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      )
    }

    const draft = validation.data

    // Generate sale_no
    const { count } = await supabaseServer
      .from('sales')
      .select('*', { count: 'exact', head: true })

    const saleNo = generateCode('S', count || 0)

    // Start transaction-like operations
    // 1. Create sale (draft)
    const { data: sale, error: saleError } = await (supabaseServer
      .from('sales') as any)
      .insert({
        sale_no: saleNo,
        customer_code: draft.customer_code || null,
        source: draft.source,
        payment_method: draft.payment_method,
        is_paid: draft.is_paid,
        note: draft.note || null,
        discount_type: draft.discount_type || 'none',
        discount_value: draft.discount_value || 0,
        status: 'draft',
        total: 0,
      })
      .select()
      .single()

    if (saleError) {
      return NextResponse.json(
        { ok: false, error: saleError.message },
        { status: 500 }
      )
    }

    // 2. Check stock availability for each item
    for (const item of draft.items) {
      const { data: product } = await (supabaseServer
        .from('products') as any)
        .select('stock, allow_negative, name')
        .eq('id', item.product_id)
        .single()

      if (!product) {
        // Rollback: delete the sale
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          { ok: false, error: `Product not found: ${item.product_id}` },
          { status: 400 }
        )
      }

      if (!product.allow_negative && product.stock < item.quantity) {
        // Rollback: delete the sale
        await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
        return NextResponse.json(
          {
            ok: false,
            error: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
          },
          { status: 400 }
        )
      }
    }

    // 3. Get product details and insert sale items (subtotal is auto-calculated by database)
    const saleItems = await Promise.all(
      draft.items.map(async (item) => {
        const { data: product } = await (supabaseServer
          .from('products') as any)
          .select('name')
          .eq('id', item.product_id)
          .single()

        return {
          sale_id: sale.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price,
          snapshot_name: product?.name || null,
        }
      })
    )

    const { error: itemsError } = await (supabaseServer
      .from('sale_items') as any)
      .insert(saleItems)

    if (itemsError) {
      // Rollback: delete the sale
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: itemsError.message },
        { status: 500 }
      )
    }

    // 4. Calculate total with discount
    const subtotal = draft.items.reduce((sum, item) => sum + (item.quantity * item.price), 0)

    let discountAmount = 0
    if (draft.discount_type === 'percent') {
      discountAmount = (subtotal * (draft.discount_value || 0)) / 100
    } else if (draft.discount_type === 'amount') {
      discountAmount = draft.discount_value || 0
    }

    const total = Math.max(0, subtotal - discountAmount)

    // 5. Update sale to confirmed (this will trigger DB functions for inventory and AR)
    const { data: confirmedSale, error: confirmError } = await (supabaseServer
      .from('sales') as any)
      .update({
        total,
        status: 'confirmed',
      })
      .eq('id', sale.id)
      .select()
      .single()

    if (confirmError) {
      // Rollback: delete items and sale
      await (supabaseServer.from('sale_items') as any).delete().eq('sale_id', sale.id)
      await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
      return NextResponse.json(
        { ok: false, error: confirmError.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { ok: true, data: confirmedSale },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
