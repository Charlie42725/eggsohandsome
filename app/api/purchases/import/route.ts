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
  // 找不到商品時，標記為需要新增
  needsNewProduct?: boolean
  newProductName?: string // 使用者輸入的商品名稱（用於快速新增）
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
  // 需要快速新增的商品
  newProductItems: {
    productName: string
    quantity: number
    cost: number
    rowNumber: number
  }[]
  errors: string[]
  warnings: string[]
  rowNumbers: number[]
  isDuplicate?: boolean  // 可能重複標記
  existingPurchaseId?: string  // 重複時的現有進貨單 ID
  existingPurchaseNo?: string  // 重複時的現有進貨單號
}

type ImportResult = {
  success: number
  failed: number
  newProductsCreated: number // 新增的商品數量
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

    // 獲取所有商品（用於條碼對應）- 使用分頁突破 Supabase 1000 筆限制
    const barcodeToProduct = new Map<string, { id: string; name: string; cost: number }>()
    const itemCodeToProduct = new Map<string, { id: string; name: string; cost: number }>()
    const productNameToProduct = new Map<string, { id: string; name: string; cost: number }>()

    const PAGE_SIZE = 1000
    let offset = 0
    let hasMoreProducts = true

    while (hasMoreProducts) {
      const { data: productBatch, error: batchError } = await (supabaseServer
        .from('products') as any)
        .select('id, barcode, item_code, name, cost')
        .eq('is_active', true)
        .range(offset, offset + PAGE_SIZE - 1)

      if (batchError) {
        console.error(`[Purchase Import] Error fetching products batch at offset ${offset}:`, batchError)
        break
      }

      if (productBatch && productBatch.length > 0) {
        productBatch.forEach((p: any) => {
          if (p.barcode) barcodeToProduct.set(p.barcode, { id: p.id, name: p.name, cost: p.cost || 0 })
          if (p.item_code) itemCodeToProduct.set(p.item_code.toLowerCase(), { id: p.id, name: p.name, cost: p.cost || 0 })
          if (p.name) productNameToProduct.set(p.name.toLowerCase().trim(), { id: p.id, name: p.name, cost: p.cost || 0 })
        })
        offset += PAGE_SIZE
        hasMoreProducts = productBatch.length === PAGE_SIZE
      } else {
        hasMoreProducts = false
      }
    }

    console.log(`[Purchase Import] Loaded ${barcodeToProduct.size} barcodes, ${itemCodeToProduct.size} item_codes, and ${productNameToProduct.size} product names for lookup`)

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
        // 查找商品：先用條碼 -> 再用商品編號 -> 再用商品名稱
        let product = barcodeToProduct.get(barcode)
        if (!product) {
          // 嘗試用 item_code 查找
          product = itemCodeToProduct.get(barcode.toLowerCase())
        }
        if (!product) {
          // 嘗試用商品名稱查找
          product = productNameToProduct.get(barcode.toLowerCase().trim())
        }
        if (!product) {
          // 找不到商品，標記為需要新增（而非直接報錯）
          importRow.needsNewProduct = true
          importRow.newProductName = barcode // 將輸入的內容當作商品名稱
          importRow.warning = `找不到商品「${barcode}」，將快速新增`
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
          newProductItems: [],
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
      } else if (row.needsNewProduct && row.newProductName) {
        // 需要快速新增的商品
        order.newProductItems.push({
          productName: row.newProductName,
          quantity: row.quantity,
          cost: row.cost || 0,
          rowNumber: row.rowNumber,
        })
      }

      if (row.warning) {
        order.warnings.push(`第 ${row.rowNumber} 行：${row.warning}`)
      }
    }

    const groupedOrders = Array.from(orderMap.values())

    // 檢測可能重複的進貨單（相同日期 + 相同廠商 + 相同金額）
    const { data: existingPurchases } = await (supabaseServer
      .from('purchases') as any)
      .select('id, purchase_no, vendor_code, purchase_date, total')

    const existingPurchaseMap = new Map<string, { id: string; purchase_no: string }>()
    if (existingPurchases) {
      existingPurchases.forEach((p: any) => {
        // 用「日期_廠商_金額」作為 key
        const key = `${p.purchase_date}_${p.vendor_code}_${p.total}`
        existingPurchaseMap.set(key, { id: p.id, purchase_no: p.purchase_no })
      })
    }

    // 標記可能重複的訂單
    for (const order of groupedOrders) {
      if (order.errors.length > 0 || order.items.length === 0) continue

      const total = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)
      const purchaseDate = order.purchaseDate || new Date().toISOString().split('T')[0]
      const key = `${purchaseDate}_${order.vendorCode}_${total}`

      const existing = existingPurchaseMap.get(key)
      if (existing) {
        order.isDuplicate = true
        order.existingPurchaseId = existing.id
        order.existingPurchaseNo = existing.purchase_no
        order.warnings.push(`可能與現有進貨單 ${existing.purchase_no} 重複（相同日期、廠商、金額）`)
      }
    }

    // 只做預覽，不實際匯入
    const preview = formData.get('preview') === 'true'
    if (preview) {
      const duplicateCount = groupedOrders.filter(o => o.isDuplicate).length
      // 收集所有需要新增的商品名稱（去重）
      const newProductNames = new Set<string>()
      groupedOrders.forEach(order => {
        order.newProductItems.forEach(item => {
          newProductNames.add(item.productName)
        })
      })

      const previewData = groupedOrders.map(order => {
        const existingTotal = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)
        const newProductTotal = order.newProductItems.reduce((sum, item) => sum + item.cost * item.quantity, 0)
        return {
          orderNo: order.orderNo,
          vendorCode: order.vendorCode,
          purchaseDate: order.purchaseDate,
          isPaid: order.isPaid,
          note: order.note,
          itemCount: order.items.length + order.newProductItems.length,
          total: existingTotal + newProductTotal,
          errors: order.errors,
          warnings: order.warnings,
          rowNumbers: order.rowNumbers,
          isDuplicate: order.isDuplicate,
          existingPurchaseNo: order.existingPurchaseNo,
          // 新增：需要快速新增的商品
          newProductItems: order.newProductItems,
        }
      })

      // 訂單有效的定義：沒有錯誤，且（有既有商品 或 有需要新增的商品）
      const validOrders = groupedOrders.filter(o =>
        o.errors.length === 0 &&
        (o.items.length > 0 || o.newProductItems.length > 0) &&
        !o.isDuplicate
      ).length

      return NextResponse.json({
        ok: true,
        preview: true,
        data: previewData,
        rows: rows, // 原始行資料供明細查看
        newProducts: Array.from(newProductNames), // 需要新增的商品清單
        summary: {
          totalOrders: groupedOrders.length,
          validOrders,
          invalidOrders: groupedOrders.filter(o => o.errors.length > 0 || (o.items.length === 0 && o.newProductItems.length === 0)).length,
          duplicateOrders: duplicateCount,
          totalItems: rows.filter(r => !r.error).length,
          warningOrders: groupedOrders.filter(o => o.warnings.length > 0 && !o.isDuplicate).length,
          newProductCount: newProductNames.size, // 需要新增的商品數量
        }
      })
    }

    // 處理重複資料的方式（每個訂單單獨設定）
    type DuplicateActionItem = { orderNo: string; action: 'skip' | 'overwrite' }
    let duplicateActionsMap = new Map<string, 'skip' | 'overwrite'>()
    const duplicateActionsJson = formData.get('duplicateActions') as string | null
    if (duplicateActionsJson) {
      try {
        const duplicateActions: DuplicateActionItem[] = JSON.parse(duplicateActionsJson)
        duplicateActions.forEach(da => {
          duplicateActionsMap.set(da.orderNo, da.action)
        })
      } catch {
        // 忽略解析錯誤，使用預設值 skip
      }
    }

    // 實際匯入
    const result: ImportResult = {
      success: 0,
      failed: 0,
      newProductsCreated: 0,
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

    // 是否要快速新增找不到的商品
    const createNewProducts = formData.get('createNewProducts') === 'true'

    // 重新標記重複訂單（需要從 groupedOrders 重新獲取）
    for (const order of groupedOrders) {
      const hasItems = order.items.length > 0 || order.newProductItems.length > 0
      if (order.errors.length > 0 || !hasItems) continue

      const existingTotal = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)
      const newProductTotal = order.newProductItems.reduce((sum, item) => sum + item.cost * item.quantity, 0)
      const total = existingTotal + newProductTotal
      const purchaseDate = order.purchaseDate || new Date().toISOString().split('T')[0]
      const key = `${purchaseDate}_${order.vendorCode}_${total}`

      const existing = existingPurchaseMap.get(key)
      if (existing) {
        order.isDuplicate = true
        order.existingPurchaseId = existing.id
        order.existingPurchaseNo = existing.purchase_no
      }
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

      // 檢查是否有商品（含需要新增的商品）
      const hasNewProductItems = createNewProducts && order.newProductItems.length > 0
      if (order.items.length === 0 && !hasNewProductItems) {
        // 如果有需要新增的商品但用戶沒有啟用快速新增，提示錯誤
        if (order.newProductItems.length > 0) {
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: `訂單包含 ${order.newProductItems.length} 個找不到的商品，請啟用「快速新增商品」功能`,
          })
        } else {
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: '訂單沒有有效的商品明細',
          })
        }
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

      // 處理重複訂單
      if (order.isDuplicate && order.existingPurchaseId) {
        const orderAction = duplicateActionsMap.get(order.orderNo) || 'skip'
        if (orderAction === 'skip') {
          result.warnings.push({
            orderNo: order.orderNo,
            message: `與 ${order.existingPurchaseNo} 重複，已略過`,
          })
          continue
        } else if (orderAction === 'overwrite') {
          // 刪除舊的進貨單（包含關聯資料）
          try {
            // 先刪除 partner_accounts
            await (supabaseServer.from('partner_accounts') as any)
              .delete()
              .eq('ref_id', order.existingPurchaseId)
              .eq('ref_type', 'purchase')

            // 再刪除 purchase_items
            await (supabaseServer.from('purchase_items') as any)
              .delete()
              .eq('purchase_id', order.existingPurchaseId)

            // 最後刪除 purchase
            await (supabaseServer.from('purchases') as any)
              .delete()
              .eq('id', order.existingPurchaseId)

            result.warnings.push({
              orderNo: order.orderNo,
              message: `已刪除舊進貨單 ${order.existingPurchaseNo} 並重新匯入`,
            })
          } catch (err: any) {
            result.failed++
            result.errors.push({
              orderNo: order.orderNo,
              message: `刪除舊進貨單失敗：${err.message}`,
            })
            continue
          }
        }
      }

      try {
        purchaseNumber++
        const purchaseNo = generateCode('P', purchaseNumber - 1)

        // 如果有需要新增的商品，先創建商品
        const createdProductIds: { productName: string; productId: string; quantity: number; cost: number }[] = []
        if (createNewProducts && order.newProductItems.length > 0) {
          // 先獲取當前最大的 item_code 編號（只查詢一次）
          const { data: maxItemCode } = await (supabaseServer
            .from('products') as any)
            .select('item_code')
            .order('item_code', { ascending: false })
            .limit(1)
            .single()

          let nextItemCodeNum = 1
          if (maxItemCode?.item_code) {
            const match = maxItemCode.item_code.match(/\d+/)
            if (match) {
              nextItemCodeNum = parseInt(match[0], 10) + 1
            }
          }

          for (const newItem of order.newProductItems) {
            // 生成商品編號（每次遞增）
            const newItemCode = `P${String(nextItemCodeNum).padStart(5, '0')}`
            nextItemCodeNum++ // 確保下一個商品有不同的編號

            // 創建商品
            const { data: newProduct, error: productError } = await (supabaseServer
              .from('products') as any)
              .insert({
                item_code: newItemCode,
                name: newItem.productName,
                unit: '個',
                price: newItem.cost, // 預設售價 = 進貨價
                cost: newItem.cost,
                stock: 0,
                avg_cost: newItem.cost,
                allow_negative: true, // 允許負庫存，方便進貨
                is_active: true,
                tags: ['快速新增'],
              })
              .select()
              .single()

            if (productError) {
              throw new Error(`創建商品「${newItem.productName}」失敗：${productError.message}`)
            }

            createdProductIds.push({
              productName: newItem.productName,
              productId: newProduct.id,
              quantity: newItem.quantity,
              cost: newItem.cost,
            })
          }
        }

        // 計算總金額（含新增商品）
        const existingTotal = order.items.reduce((sum, item) => sum + item.cost * item.quantity, 0)
        const newProductTotal = createdProductIds.reduce((sum, item) => sum + item.cost * item.quantity, 0)
        const total = existingTotal + newProductTotal

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

        // 建立進貨明細（含既有商品和新增商品）
        const purchaseItemsData = [
          ...order.items.map(item => ({
            purchase_id: purchase.id,
            product_id: item.productId,
            quantity: item.quantity,
            cost: item.cost,
          })),
          ...createdProductIds.map(item => ({
            purchase_id: purchase.id,
            product_id: item.productId,
            quantity: item.quantity,
            cost: item.cost,
          })),
        ]

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
        result.newProductsCreated += createdProductIds.length

        // 記錄警告和新增商品的信息
        const messages: string[] = []
        if (order.warnings.length > 0) {
          messages.push(...order.warnings)
        }
        if (createdProductIds.length > 0) {
          const productNames = createdProductIds.map(p => p.productName).join('、')
          messages.push(`已快速新增商品：${productNames}`)
        }
        if (messages.length > 0) {
          result.warnings.push({
            orderNo: order.orderNo,
            message: messages.join('; '),
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
