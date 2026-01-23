import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateCode } from '@/lib/utils'
import { getTaiwanTime } from '@/lib/timezone'
import * as XLSX from 'xlsx'

type ImportRow = {
  rowNumber: number
  orderNo: string
  vendorCode: string | null
  vendorName: string | null
  purchaseDate: string | null
  isPaid: boolean
  barcode: string
  quantity: number
  cost: number | null
  note: string | null
  error?: string
  warning?: string
  // 解析後的資料
  productId?: string
  productName?: string
}

type GroupedOrder = {
  orderNo: string
  vendorCode: string | null
  purchaseDate: string | null
  isPaid: boolean
  note: string | null
  items: {
    productId: string
    quantity: number
    cost: number
  }[]
  errors: string[]
  warnings: string[]
  rowNumbers: number[]
}

type ImportResult = {
  success: number
  failed: number
  errors: { orderNo: string; message: string }[]
  warnings: { orderNo: string; message: string }[]
}

// POST /api/purchases/import - 批量匯入進貨
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { ok: false, error: '請選擇檔案' },
        { status: 400 }
      )
    }

    // 檢查檔案類型
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      return NextResponse.json(
        { ok: false, error: '請上傳 .xlsx、.xls 或 .csv 檔案' },
        { status: 400 }
      )
    }

    // 讀取 Excel 檔案
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][]

    if (rawData.length < 2) {
      return NextResponse.json(
        { ok: false, error: '檔案中沒有資料（需要標題列和至少一行資料）' },
        { status: 400 }
      )
    }

    // 解析標題列
    const headers = rawData[0].map((h: any) => String(h || '').trim())
    const columnMap: Record<string, number> = {}

    headers.forEach((header, index) => {
      const h = header.toLowerCase()
      if (h.includes('訂單編號') || h.includes('進貨單號') || h === 'order_no' || h === 'orderno' || h === 'purchase_no') {
        columnMap['orderNo'] = index
      } else if (h.includes('廠商代碼') || h === 'vendor_code') {
        columnMap['vendorCode'] = index
      } else if (h.includes('廠商名稱') || h === 'vendor_name') {
        columnMap['vendorName'] = index
      } else if (h.includes('進貨日期') || h.includes('日期') || h === 'date' || h === 'purchase_date') {
        columnMap['purchaseDate'] = index
      } else if (h.includes('已付款') || h.includes('是否已付') || h === 'is_paid') {
        columnMap['isPaid'] = index
      } else if (h.includes('商品條碼') || h.includes('條碼') || h === 'barcode') {
        columnMap['barcode'] = index
      } else if (h.includes('數量') || h === 'quantity' || h === 'qty') {
        columnMap['quantity'] = index
      } else if (h.includes('進貨價') || h.includes('成本') || h.includes('單價') || h === 'cost' || h === 'price') {
        columnMap['cost'] = index
      } else if (h.includes('備註') || h === 'note') {
        columnMap['note'] = index
      }
    })

    // 檢查必要欄位
    if (columnMap['orderNo'] === undefined) {
      return NextResponse.json(
        { ok: false, error: '找不到「訂單編號」或「進貨單號」欄位' },
        { status: 400 }
      )
    }
    if (columnMap['barcode'] === undefined) {
      return NextResponse.json(
        { ok: false, error: '找不到「商品條碼」欄位' },
        { status: 400 }
      )
    }
    if (columnMap['quantity'] === undefined) {
      return NextResponse.json(
        { ok: false, error: '找不到「數量」欄位' },
        { status: 400 }
      )
    }

    // 獲取所有廠商（用於代碼和名稱對應）
    const { data: vendors } = await (supabaseServer
      .from('vendors') as any)
      .select('vendor_code, vendor_name')

    const vendorCodeSet = new Set<string>()
    const vendorNameToCode = new Map<string, string>()
    if (vendors) {
      vendors.forEach((v: any) => {
        vendorCodeSet.add(v.vendor_code)
        vendorNameToCode.set(v.vendor_name.toLowerCase(), v.vendor_code)
      })
    }

    // 獲取所有商品（用於條碼對應）
    const { data: products } = await (supabaseServer
      .from('products') as any)
      .select('id, barcode, item_code, name, cost')
      .eq('is_active', true)

    const barcodeToProduct = new Map<string, { id: string; name: string; cost: number }>()
    const itemCodeToProduct = new Map<string, { id: string; name: string; cost: number }>()
    if (products) {
      products.forEach((p: any) => {
        if (p.barcode) barcodeToProduct.set(p.barcode, { id: p.id, name: p.name, cost: p.cost || 0 })
        if (p.item_code) itemCodeToProduct.set(p.item_code.toLowerCase(), { id: p.id, name: p.name, cost: p.cost || 0 })
      })
    }

    // 解析資料列
    const rows: ImportRow[] = []

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || row.length === 0) continue

      // 跳過全空行
      const isEmptyRow = row.every(cell => cell === undefined || cell === null || String(cell).trim() === '')
      if (isEmptyRow) continue

      const orderNo = columnMap['orderNo'] !== undefined ? String(row[columnMap['orderNo']] || '').trim() : ''
      const vendorCode = columnMap['vendorCode'] !== undefined ? String(row[columnMap['vendorCode']] || '').trim() || null : null
      const vendorName = columnMap['vendorName'] !== undefined ? String(row[columnMap['vendorName']] || '').trim() || null : null
      const purchaseDate = columnMap['purchaseDate'] !== undefined ? String(row[columnMap['purchaseDate']] || '').trim() || null : null
      const isPaidRaw = columnMap['isPaid'] !== undefined ? String(row[columnMap['isPaid']] || '').trim().toLowerCase() : ''
      const barcode = columnMap['barcode'] !== undefined ? String(row[columnMap['barcode']] || '').trim() : ''
      const quantity = columnMap['quantity'] !== undefined ? parseInt(row[columnMap['quantity']]) || 0 : 0
      const costRaw = columnMap['cost'] !== undefined ? row[columnMap['cost']] : null
      const cost = costRaw !== null && costRaw !== '' ? parseFloat(costRaw) : null
      const note = columnMap['note'] !== undefined ? String(row[columnMap['note']] || '').trim() || null : null

      // 解析是否已付款
      const isPaid = isPaidRaw === '是' || isPaidRaw === 'yes' || isPaidRaw === 'true' || isPaidRaw === '1'

      const importRow: ImportRow = {
        rowNumber: i + 1,
        orderNo,
        vendorCode,
        vendorName,
        purchaseDate,
        isPaid,
        barcode,
        quantity,
        cost,
        note,
      }

      // 驗證
      if (!orderNo) {
        importRow.error = '訂單編號不能為空'
      } else if (!barcode) {
        importRow.error = '商品條碼不能為空'
      } else if (quantity <= 0 || !Number.isInteger(quantity)) {
        importRow.error = '數量必須為正整數'
      } else {
        // 查找商品
        let product = barcodeToProduct.get(barcode)
        if (!product) {
          // 嘗試用 item_code 查找
          product = itemCodeToProduct.get(barcode.toLowerCase())
        }
        if (!product) {
          importRow.error = `找不到商品：${barcode}`
        } else {
          importRow.productId = product.id
          importRow.productName = product.name
          // 如果沒指定成本，使用商品成本
          if (importRow.cost === null) {
            importRow.cost = product.cost
          }
        }

        // 驗證廠商（如果有指定）
        let resolvedVendorCode = vendorCode
        if (!resolvedVendorCode && vendorName) {
          // 嘗試用名稱找代碼
          resolvedVendorCode = vendorNameToCode.get(vendorName.toLowerCase()) || null
        }
        if (resolvedVendorCode && !vendorCodeSet.has(resolvedVendorCode)) {
          importRow.error = `找不到廠商：${resolvedVendorCode || vendorName}`
        } else {
          importRow.vendorCode = resolvedVendorCode
        }

        // 警告：沒有指定廠商
        if (!resolvedVendorCode) {
          importRow.warning = '未指定廠商'
        }
      }

      rows.push(importRow)
    }

    // 按訂單編號分組
    const orderMap = new Map<string, GroupedOrder>()

    for (const row of rows) {
      if (!row.orderNo) continue

      if (!orderMap.has(row.orderNo)) {
        orderMap.set(row.orderNo, {
          orderNo: row.orderNo,
          vendorCode: row.vendorCode,
          purchaseDate: row.purchaseDate,
          isPaid: row.isPaid,
          note: row.note,
          items: [],
          errors: [],
          warnings: [],
          rowNumbers: [],
        })
      }

      const order = orderMap.get(row.orderNo)!
      order.rowNumbers.push(row.rowNumber)

      if (row.error) {
        order.errors.push(`第 ${row.rowNumber} 行：${row.error}`)
      } else if (row.productId) {
        order.items.push({
          productId: row.productId,
          quantity: row.quantity,
          cost: row.cost || 0,
        })
      }

      if (row.warning) {
        order.warnings.push(`第 ${row.rowNumber} 行：${row.warning}`)
      }
    }

    const groupedOrders = Array.from(orderMap.values())

    // 只做預覽，不實際匯入
    const preview = formData.get('preview') === 'true'
    if (preview) {
      const previewData = groupedOrders.map(order => ({
        orderNo: order.orderNo,
        vendorCode: order.vendorCode,
        purchaseDate: order.purchaseDate,
        isPaid: order.isPaid,
        note: order.note,
        itemCount: order.items.length,
        total: order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0),
        errors: order.errors,
        warnings: order.warnings,
        rowNumbers: order.rowNumbers,
      }))

      return NextResponse.json({
        ok: true,
        preview: true,
        data: previewData,
        rows: rows, // 原始行資料供明細查看
        summary: {
          totalOrders: groupedOrders.length,
          validOrders: groupedOrders.filter(o => o.errors.length === 0 && o.items.length > 0).length,
          invalidOrders: groupedOrders.filter(o => o.errors.length > 0 || o.items.length === 0).length,
          totalItems: rows.filter(r => !r.error).length,
          warningOrders: groupedOrders.filter(o => o.warnings.length > 0).length,
        }
      })
    }

    // 實際匯入
    const result: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
      warnings: [],
    }

    // 獲取最大 purchase_no 編號（使用正確的方式避免重複）
    const { data: allPurchases } = await supabaseServer
      .from('purchases')
      .select('purchase_no')

    let purchaseNumber = 0
    if (allPurchases && allPurchases.length > 0) {
      const maxNumber = allPurchases.reduce((max: number, purchase: any) => {
        const match = purchase.purchase_no.match(/\d+/)
        if (match) {
          const num = parseInt(match[0], 10)
          return num > max ? num : max
        }
        return max
      }, 0)
      purchaseNumber = maxNumber
    }

    // 處理每筆訂單
    for (const order of groupedOrders) {
      // 跳過有錯誤或沒有商品的訂單
      if (order.errors.length > 0) {
        result.failed++
        result.errors.push({
          orderNo: order.orderNo,
          message: order.errors.join('; '),
        })
        continue
      }

      if (order.items.length === 0) {
        result.failed++
        result.errors.push({
          orderNo: order.orderNo,
          message: '訂單沒有有效的商品明細',
        })
        continue
      }

      // 檢查是否有廠商
      if (!order.vendorCode) {
        result.failed++
        result.errors.push({
          orderNo: order.orderNo,
          message: '進貨單必須指定廠商',
        })
        continue
      }

      try {
        purchaseNumber++
        const purchaseNo = generateCode('P', purchaseNumber - 1)
        const total = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)

        // 解析進貨日期
        let purchaseDate = new Date().toISOString().split('T')[0] // 預設當天
        let createdAt = getTaiwanTime()
        if (order.purchaseDate) {
          try {
            const parsedDate = new Date(order.purchaseDate)
            if (!isNaN(parsedDate.getTime())) {
              purchaseDate = parsedDate.toISOString().split('T')[0]
              // 設定為當天的中午 12:00（避免時區問題）
              parsedDate.setHours(12, 0, 0, 0)
              createdAt = parsedDate.toISOString()
            }
          } catch {
            // 使用當前時間
          }
        }

        // 建立進貨單
        const { data: purchase, error: purchaseError } = await (supabaseServer
          .from('purchases') as any)
          .insert({
            purchase_no: purchaseNo,
            vendor_code: order.vendorCode,
            purchase_date: purchaseDate,
            is_paid: order.isPaid,
            total,
            status: 'approved', // 匯入的進貨單直接審核通過
            note: order.note,
            created_at: createdAt,
          })
          .select()
          .single()

        if (purchaseError) {
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: `建立進貨單失敗：${purchaseError.message}`,
          })
          purchaseNumber--
          continue
        }

        // 建立進貨明細
        const purchaseItemsData = order.items.map(item => ({
          purchase_id: purchase.id,
          product_id: item.productId,
          quantity: item.quantity,
          cost: item.cost,
        }))

        const { data: insertedPurchaseItems, error: itemsError } = await (supabaseServer
          .from('purchase_items') as any)
          .insert(purchaseItemsData)
          .select()

        if (itemsError) {
          // 刪除已建立的進貨單
          await (supabaseServer.from('purchases') as any).delete().eq('id', purchase.id)
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: `建立進貨明細失敗：${itemsError.message}`,
          })
          purchaseNumber--
          continue
        }

        // 如果未付款，建立應付帳款
        if (!order.isPaid && insertedPurchaseItems) {
          // 計算每個商品的到期日（預設 30 天後）
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + 30)
          const dueDateStr = dueDate.toISOString().split('T')[0]

          // 為每個進貨明細創建 AP 記錄
          for (const purchaseItem of insertedPurchaseItems) {
            await (supabaseServer
              .from('partner_accounts') as any)
              .insert({
                partner_type: 'vendor',
                partner_code: order.vendorCode,
                direction: 'AP',
                ref_type: 'purchase',
                ref_id: purchase.id,
                purchase_item_id: purchaseItem.id,
                amount: purchaseItem.subtotal || (purchaseItem.cost * purchaseItem.quantity),
                received_paid: 0,
                due_date: dueDateStr,
                status: 'unpaid',
              })
          }
        }

        result.success++
        if (order.warnings.length > 0) {
          result.warnings.push({
            orderNo: order.orderNo,
            message: order.warnings.join('; '),
          })
        }
      } catch (err: any) {
        result.failed++
        result.errors.push({
          orderNo: order.orderNo,
          message: err.message || '未知錯誤',
        })
        purchaseNumber--
      }
    }

    return NextResponse.json({
      ok: true,
      preview: false,
      result,
    })
  } catch (error: any) {
    console.error('Failed to import purchases:', error)
    return NextResponse.json(
      { ok: false, error: error.message || '匯入失敗' },
      { status: 500 }
    )
  }
}
