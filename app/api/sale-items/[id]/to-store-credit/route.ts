import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { getTaiwanTime } from '@/lib/timezone'

type RouteContext = {
    params: Promise<{ id: string }>
}

// POST /api/sale-items/:id/to-store-credit - 將單一銷售品項轉為購物金
export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const { id: saleItemId } = await context.params
        const body = await request.json()
        const { amount, refund_inventory = true, note } = body

        // 1. 查詢銷售品項
        const { data: saleItem, error: itemError } = await (supabaseServer
            .from('sale_items') as any)
            .select(`
        *,
        sales (
          id,
          sale_no,
          customer_code,
          status,
          customers (
            customer_name,
            store_credit
          )
        ),
        products (
          id,
          name,
          stock
        )
      `)
            .eq('id', saleItemId)
            .single()

        if (itemError || !saleItem) {
            return NextResponse.json(
                { ok: false, error: '找不到銷售品項' },
                { status: 404 }
            )
        }

        const sale = saleItem.sales
        if (!sale) {
            return NextResponse.json(
                { ok: false, error: '找不到對應的銷售單' },
                { status: 404 }
            )
        }

        // 2. 驗證客戶
        if (!sale.customer_code) {
            return NextResponse.json(
                { ok: false, error: '此銷售單沒有關聯客戶，無法轉為購物金' },
                { status: 400 }
            )
        }

        const customer = sale.customers
        if (!customer) {
            return NextResponse.json(
                { ok: false, error: '找不到客戶資料' },
                { status: 404 }
            )
        }

        // 3. 計算轉換金額
        const itemSubtotal = saleItem.price * saleItem.quantity
        const conversionAmount = amount && amount > 0 && amount <= itemSubtotal ? amount : itemSubtotal
        const storeCreditBefore = customer.store_credit || 0
        const storeCreditAfter = storeCreditBefore + conversionAmount

        // 4. 更新客戶購物金餘額
        const { error: updateCustomerError } = await (supabaseServer
            .from('customers') as any)
            .update({ store_credit: storeCreditAfter })
            .eq('customer_code', sale.customer_code)

        if (updateCustomerError) {
            return NextResponse.json(
                { ok: false, error: '更新客戶購物金失敗' },
                { status: 500 }
            )
        }

        // 5. 記錄購物金變動日誌
        await (supabaseServer
            .from('customer_balance_logs') as any)
            .insert({
                customer_code: sale.customer_code,
                amount: conversionAmount,
                balance_before: storeCreditBefore,
                balance_after: storeCreditAfter,
                type: 'refund',
                ref_type: 'sale_item',
                ref_id: saleItem.id,
                ref_no: sale.sale_no,
                note: note || `銷售品項 ${saleItem.products?.name} 轉購物金`,
                created_at: getTaiwanTime(),
            })

        // 6. 回補庫存（如果需要）
        let inventoryRestored = 0
        if (refund_inventory && saleItem.product_id) {
            // 寫入庫存日誌（trigger 會自動更新 stock）
            const { error: invLogError } = await (supabaseServer
                .from('inventory_logs') as any)
                .insert({
                    product_id: saleItem.product_id,
                    ref_type: 'return',
                    ref_id: saleItem.id,
                    qty_change: saleItem.quantity,
                    memo: `銷售品項轉購物金回補 - ${sale.sale_no}`,
                })

            if (!invLogError) {
                inventoryRestored = saleItem.quantity
            }
        }

        // 7. 刪除相關應收帳款記錄
        await (supabaseServer
            .from('partner_accounts') as any)
            .delete()
            .eq('sale_item_id', saleItem.id)

        // 8. 記錄銷貨更正
        await (supabaseServer
            .from('sale_corrections') as any)
            .insert({
                sale_id: sale.id,
                correction_type: 'to_store_credit',
                original_total: itemSubtotal,
                corrected_total: itemSubtotal - conversionAmount,
                adjustment_amount: -conversionAmount,
                store_credit_granted: conversionAmount,
                items_adjusted: [{ sale_item_id: saleItem.id, quantity: saleItem.quantity, amount: conversionAmount }],
                note: note || `單品轉購物金 - ${saleItem.products?.name}`,
                created_at: getTaiwanTime(),
            })

        // 9. 更新品項價格（扣除轉換金額）
        const newItemPrice = conversionAmount >= itemSubtotal ? 0 : (saleItem.price - (conversionAmount / saleItem.quantity))
        const { error: updateItemError } = await (supabaseServer
            .from('sale_items') as any)
            .update({ price: Math.max(0, newItemPrice) })
            .eq('id', saleItemId)

        if (updateItemError) {
            console.error('Failed to update sale item price:', updateItemError)
        }

        // 10. 更新銷售單總額
        const { data: allItems } = await (supabaseServer
            .from('sale_items') as any)
            .select('price, quantity')
            .eq('sale_id', sale.id)

        const newTotal = allItems?.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0) || 0

        await (supabaseServer
            .from('sales') as any)
            .update({
                total: newTotal,
                updated_at: getTaiwanTime()
            })
            .eq('id', sale.id)

        return NextResponse.json({
            ok: true,
            data: {
                sale_item_id: saleItem.id,
                sale_no: sale.sale_no,
                product_name: saleItem.products?.name,
                customer_name: customer.customer_name,
                conversion_amount: conversionAmount,
                store_credit_before: storeCreditBefore,
                store_credit_after: storeCreditAfter,
                inventory_restored: inventoryRestored,
            }
        })
    } catch (error) {
        console.error('Sale item to store credit error:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
