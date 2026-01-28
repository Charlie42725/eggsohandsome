import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateCode } from '@/lib/utils'
import { getTaiwanTime } from '@/lib/timezone'
import * as XLSX from 'xlsx'

type ImportRow = {
  rowNumber: number
  orderNo: string
  customerCode: string | null
  customerName: string | null
  saleDate: string | null
  source: string
  paymentMethod: string
  isPaid: boolean
  isShipped: boolean // 是否已出貨
  barcode: string
  quantity: number
  price: number | null
  note: string | null
  error?: string
  warning?: string
  // 解析後的資料
  productId?: string
  productName?: string
  accountId?: string | null
}

type MissingProduct = {
  barcode: string
  suggestedName: string
  suggestedPrice: number | null
  rowNumbers: number[]
}

type GroupedOrder = {
  orderNo: string
  customerCode: string | null
  customerName: string | null
  saleDate: string | null
  source: string
  paymentMethod: string
  isPaid: boolean
  isShipped: boolean // 是否已出貨
  note: string | null
  accountId: string | null
  items: {
    productId: string
    quantity: number
    price: number
  }[]
  errors: string[]
  warnings: string[]
  rowNumbers: number[]
  isDuplicate?: boolean
  existingSaleNo?: string
  existingSaleId?: string
}

type ImportResult = {
  success: number
  failed: number
  errors: { orderNo: string; message: string }[]
  warnings: { orderNo: string; message: string }[]
}

// POST /api/sales/import - 批量匯入銷貨
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
      if (h.includes('訂單編號') || h === 'order_no' || h === 'orderno') {
        columnMap['orderNo'] = index
      } else if (h === '客戶' || h.includes('客戶代碼') || h.includes('客戶名稱') || h === 'customer' || h === 'customer_code' || h === 'customer_name') {
        columnMap['customer'] = index
      } else if (h.includes('銷售日期') || h.includes('日期') || h === 'date' || h === 'sale_date') {
        columnMap['saleDate'] = index
      } else if (h.includes('來源') || h === 'source') {
        columnMap['source'] = index
      } else if (h.includes('付款方式') || h === 'payment_method') {
        columnMap['paymentMethod'] = index
      } else if (h.includes('已付款') || h.includes('是否已付') || h === 'is_paid') {
        columnMap['isPaid'] = index
      } else if (h.includes('已出貨') || h.includes('是否已出') || h === 'is_shipped' || h === 'shipped') {
        columnMap['isShipped'] = index
      } else if (h.includes('商品') || h.includes('條碼') || h.includes('品號') || h === 'barcode' || h === 'product') {
        columnMap['barcode'] = index
      } else if (h.includes('數量') || h === 'quantity' || h === 'qty') {
        columnMap['quantity'] = index
      } else if (h.includes('售價') || h.includes('單價') || h === 'price') {
        columnMap['price'] = index
      } else if (h.includes('備註') || h === 'note') {
        columnMap['note'] = index
      }
    })

    // 檢查必要欄位
    if (columnMap['orderNo'] === undefined) {
      return NextResponse.json(
        { ok: false, error: '找不到「訂單編號」欄位' },
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

    // 獲取所有客戶（用於代碼和名稱對應）
    const { data: customers } = await (supabaseServer
      .from('customers') as any)
      .select('customer_code, customer_name')

    const customerCodeSet = new Set<string>()
    const customerNameToCode = new Map<string, string>()
    const customerNameSet = new Set<string>() // 只包含資料庫中已存在的客戶
    // 臨時映射：用於追蹤本次匯入中待創建的新客戶（避免同一客戶重複生成代碼）
    const pendingCustomerNameToCode = new Map<string, string>()
    let maxCustomerNumber = 0
    if (customers) {
      customers.forEach((c: any) => {
        customerCodeSet.add(c.customer_code)
        customerNameToCode.set(c.customer_name.toLowerCase(), c.customer_code)
        customerNameSet.add(c.customer_name.toLowerCase())
        // 找出最大的客戶編號（用於自動生成）
        const match = c.customer_code.match(/C(\d+)/)
        if (match) {
          const num = parseInt(match[1], 10)
          if (num > maxCustomerNumber) maxCustomerNumber = num
        }
      })
    }

    // 獲取所有商品（用於條碼對應）- 使用分頁突破 Supabase 1000 筆限制
    let allProducts: any[] = []
    let pageSize = 1000
    let page = 0
    let hasMore = true

    while (hasMore) {
      const { data: products } = await (supabaseServer
        .from('products') as any)
        .select('id, barcode, item_code, name, price')
        .eq('is_active', true)
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (products && products.length > 0) {
        allProducts = allProducts.concat(products)
        page++
        hasMore = products.length === pageSize
      } else {
        hasMore = false
      }
    }

    const products = allProducts

    const barcodeToProduct = new Map<string, { id: string; name: string; price: number }>()
    const itemCodeToProduct = new Map<string, { id: string; name: string; price: number }>()
    const nameToProduct = new Map<string, { id: string; name: string; price: number }>()
    if (products) {
      console.log(`[Sales Import] Loaded ${products.length} active products`)
      products.forEach((p: any) => {
        // 統一轉為字串並 trim，確保比對不會因類型差異失敗
        const barcodeStr = String(p.barcode || '').trim()
        if (barcodeStr) {
          barcodeToProduct.set(barcodeStr, { id: p.id, name: p.name, price: p.price })
        }
        if (p.item_code) itemCodeToProduct.set(String(p.item_code).toLowerCase().trim(), { id: p.id, name: p.name, price: p.price })
        // 商品名稱對應（用於名稱匹配）
        if (p.name) nameToProduct.set(String(p.name).toLowerCase().trim(), { id: p.id, name: p.name, price: p.price })
      })
      console.log(`[Sales Import] Barcode map has ${barcodeToProduct.size} entries, Name map has ${nameToProduct.size} entries`)
    }

    // 獲取所有帳戶（用於付款方式對應）
    const { data: accounts } = await (supabaseServer
      .from('accounts') as any)
      .select('id, account_name')
      .eq('is_active', true)

    const accountNameToId = new Map<string, string>()
    if (accounts) {
      accounts.forEach((a: any) => {
        accountNameToId.set(a.account_name.toLowerCase(), a.id)
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
      const customer = columnMap['customer'] !== undefined ? String(row[columnMap['customer']] || '').trim() || null : null
      const saleDate = columnMap['saleDate'] !== undefined ? String(row[columnMap['saleDate']] || '').trim() || null : null
      const sourceRaw = columnMap['source'] !== undefined ? String(row[columnMap['source']] || '').trim().toLowerCase() : 'manual'
      const paymentMethod = columnMap['paymentMethod'] !== undefined ? String(row[columnMap['paymentMethod']] || '').trim() : 'pending'
      const isPaidRaw = columnMap['isPaid'] !== undefined ? String(row[columnMap['isPaid']] || '').trim().toLowerCase() : ''
      const isShippedRaw = columnMap['isShipped'] !== undefined ? String(row[columnMap['isShipped']] || '').trim().toLowerCase() : ''
      const barcode = columnMap['barcode'] !== undefined ? String(row[columnMap['barcode']] || '').trim() : ''
      const quantity = columnMap['quantity'] !== undefined ? parseInt(row[columnMap['quantity']]) || 0 : 0
      const priceRaw = columnMap['price'] !== undefined ? row[columnMap['price']] : null
      const price = priceRaw !== null && priceRaw !== '' ? parseFloat(priceRaw) : null
      const note = columnMap['note'] !== undefined ? String(row[columnMap['note']] || '').trim() || null : null

      // 解析來源
      const source = ['pos', 'live', 'manual'].includes(sourceRaw) ? sourceRaw : 'manual'

      // 解析是否已付款
      // 支援兩種方式：
      // 1. 「是否已付款」欄位填寫「是」
      // 2. 「付款方式」欄位填寫「是」（表示已付款但未指定方式）
      const isPaidFromMethod = paymentMethod.toLowerCase() === '是' || paymentMethod.toLowerCase() === 'yes' || paymentMethod.toLowerCase() === 'true' || paymentMethod === '1'
      const isPaid = isPaidRaw === '是' || isPaidRaw === 'yes' || isPaidRaw === 'true' || isPaidRaw === '1' || isPaidFromMethod

      // 解析是否已出貨（預設為「是」，與原本行為一致）
      // 如果沒有此欄位或為空，預設已出貨；填「否」才是未出貨
      const isShipped = isShippedRaw === '' || isShippedRaw === '是' || isShippedRaw === 'yes' || isShippedRaw === 'true' || isShippedRaw === '1'

      const importRow: ImportRow = {
        rowNumber: i + 1,
        orderNo,
        customerCode: customer,
        customerName: customer,
        saleDate,
        source,
        paymentMethod,
        isPaid,
        isShipped,
        barcode,
        quantity,
        price,
        note,
      }

      // 驗證
      if (!orderNo) {
        importRow.error = '訂單編號不能為空'
      } else if (!barcode) {
        importRow.error = '商品欄位不能為空'
      } else if (quantity <= 0 || !Number.isInteger(quantity)) {
        importRow.error = '數量必須為正整數'
      } else {
        // 查找商品：依序嘗試 barcode → item_code → 商品名稱
        let product = barcodeToProduct.get(barcode)
        if (!product) {
          // 嘗試用 item_code 查找
          product = itemCodeToProduct.get(barcode.toLowerCase())
        }
        if (!product) {
          // 嘗試用商品名稱查找（精確匹配）
          product = nameToProduct.get(barcode.toLowerCase())
        }
        if (!product) {
          // 調試：顯示匹配失敗的詳情
          console.log(`[Sales Import] Product not found for: "${barcode}" (length: ${barcode.length})`)
          // 標記為找不到商品（但不設為 error，允許快速建立）
          importRow.warning = `找不到商品：${barcode}（可快速建立）`
          importRow.productId = undefined
          importRow.productName = barcode // 用輸入值作為建議名稱
        } else {
          importRow.productId = product.id
          importRow.productName = product.name
          // 如果沒指定價格，使用商品定價
          if (importRow.price === null) {
            importRow.price = product.price
          }
        }

        // 驗證客戶（如果有指定）- 找不到就之後自動建立（只需要名稱）
        if (customer) {
          // 先嘗試用代碼匹配（資料庫中已存在）
          if (customerCodeSet.has(customer)) {
            importRow.customerCode = customer
          } else {
            // 再嘗試用名稱匹配（資料庫中已存在）
            const codeByName = customerNameToCode.get(customer.toLowerCase())
            if (codeByName) {
              importRow.customerCode = codeByName
            } else {
              // 檢查是否已在本次匯入中標記為待創建
              const pendingCode = pendingCustomerNameToCode.get(customer.toLowerCase())
              if (pendingCode) {
                // 使用已生成的代碼，避免重複生成（不再顯示警告，避免誤解）
                importRow.customerCode = pendingCode
                importRow.customerName = customer
                // 不設置 warning，因為已經在第一次出現時顯示過了
              } else {
                // 都找不到，之後會自動建立（用名稱作為識別）
                importRow.warning = `將自動建立客戶：${customer}`
                // 自動生成客戶代碼
                maxCustomerNumber++
                const newCustomerCode = `C${String(maxCustomerNumber).padStart(3, '0')}`
                importRow.customerCode = newCustomerCode
                importRow.customerName = customer
                // 重要：加入臨時映射，避免同一客戶在多行時重複生成代碼
                // 注意：不加入 customerNameSet，因為實際匯入時需要檢查並創建
                customerCodeSet.add(newCustomerCode) // 避免代碼衝突
                pendingCustomerNameToCode.set(customer.toLowerCase(), newCustomerCode)
              }
            }
          }
        }

        // 查找帳戶（如果有指定付款方式且非 pending）
        // 如果付款方式是「是」等表示已付款的值，不需要查找帳戶
        const isPaidKeywords = ['是', 'yes', 'true', '1', 'pending']
        if (paymentMethod && !isPaidKeywords.includes(paymentMethod.toLowerCase())) {
          const accountId = accountNameToId.get(paymentMethod.toLowerCase())
          if (!accountId) {
            importRow.warning = `找不到帳戶「${paymentMethod}」，將設為待收款`
            importRow.accountId = null
          } else {
            importRow.accountId = accountId
          }
        } else {
          importRow.accountId = null
        }
      }

      rows.push(importRow)
    }

    // 收集找不到的商品
    const missingProductMap = new Map<string, MissingProduct>()
    for (const row of rows) {
      if (!row.productId && !row.error && row.barcode) {
        const key = row.barcode.toLowerCase()
        if (!missingProductMap.has(key)) {
          missingProductMap.set(key, {
            barcode: row.barcode,
            suggestedName: row.barcode,
            suggestedPrice: row.price,
            rowNumbers: [],
          })
        }
        missingProductMap.get(key)!.rowNumbers.push(row.rowNumber)
        // 如果有價格，更新建議價格
        if (row.price !== null) {
          missingProductMap.get(key)!.suggestedPrice = row.price
        }
      }
    }
    const missingProducts = Array.from(missingProductMap.values())

    // 按訂單編號分組
    const orderMap = new Map<string, GroupedOrder>()

    for (const row of rows) {
      if (!row.orderNo) continue

      if (!orderMap.has(row.orderNo)) {
        orderMap.set(row.orderNo, {
          orderNo: row.orderNo,
          customerCode: row.customerCode,
          customerName: row.customerName || row.customerCode,
          saleDate: row.saleDate,
          source: row.source,
          paymentMethod: row.paymentMethod,
          isPaid: row.isPaid,
          isShipped: row.isShipped,
          note: row.note,
          accountId: row.accountId || null,
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
          price: row.price || 0,
        })
      } else if (row.barcode && !row.productId) {
        // 找不到商品，標記為需要建立
        order.warnings.push(`第 ${row.rowNumber} 行：找不到商品「${row.barcode}」`)
      }

      if (row.warning && row.productId) {
        // 只有有 productId 的警告才顯示（例如自動建立客戶）
        order.warnings.push(`第 ${row.rowNumber} 行：${row.warning}`)
      }
    }

    const groupedOrders = Array.from(orderMap.values())

    // 只做預覽，不實際匯入
    const preview = formData.get('preview') === 'true'
    if (preview) {
      // 查詢現有銷售單，用於檢測重複（基於日期、客戶、金額）
      const { data: existingSales } = await (supabaseServer
        .from('sales') as any)
        .select('id, sale_no, sale_date, customer_code, total')

      // 建立一個 map 用於快速查找重複
      const existingSalesMap = new Map<string, { id: string; sale_no: string }>()
      if (existingSales) {
        for (const sale of existingSales) {
          // 用日期+客戶+金額作為 key
          const key = `${sale.sale_date || ''}_${sale.customer_code || ''}_${sale.total || 0}`
          existingSalesMap.set(key, { id: sale.id, sale_no: sale.sale_no })
        }
      }

      // 檢查每個訂單是否重複
      for (const order of groupedOrders) {
        if (order.errors.length === 0 && order.items.length > 0) {
          const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
          // 解析日期
          let saleDate = new Date().toISOString().split('T')[0]
          if (order.saleDate) {
            try {
              const parsedDate = new Date(order.saleDate)
              if (!isNaN(parsedDate.getTime())) {
                saleDate = parsedDate.toISOString().split('T')[0]
              }
            } catch {
              // 使用預設日期
            }
          }
          const key = `${saleDate}_${order.customerCode || ''}_${total}`
          const existingSale = existingSalesMap.get(key)
          if (existingSale) {
            order.isDuplicate = true
            order.existingSaleNo = existingSale.sale_no
            order.existingSaleId = existingSale.id
          }
        }
      }

      const previewData = groupedOrders.map(order => ({
        orderNo: order.orderNo,
        customerCode: order.customerCode,
        saleDate: order.saleDate,
        source: order.source,
        paymentMethod: order.paymentMethod,
        isPaid: order.isPaid,
        isShipped: order.isShipped,
        note: order.note,
        itemCount: order.items.length,
        total: order.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
        errors: order.errors,
        warnings: order.warnings,
        rowNumbers: order.rowNumbers,
        isDuplicate: order.isDuplicate,
        existingSaleNo: order.existingSaleNo,
        existingSaleId: order.existingSaleId,
      }))

      // 計算有效訂單數（沒有錯誤且有商品，或者可以通過建立缺失商品來補齊）
      const ordersWithMissingProducts = groupedOrders.filter(o =>
        o.errors.length === 0 && o.items.length === 0 && o.warnings.some(w => w.includes('找不到商品'))
      ).length

      // 計算非重複的有效訂單數
      const validNonDuplicateOrders = groupedOrders.filter(o => o.errors.length === 0 && o.items.length > 0 && !o.isDuplicate).length
      const duplicateOrdersCount = groupedOrders.filter(o => o.isDuplicate).length

      return NextResponse.json({
        ok: true,
        preview: true,
        data: previewData,
        rows: rows, // 原始行資料供明細查看
        missingProducts, // 找不到的商品清單
        summary: {
          totalOrders: groupedOrders.length,
          validOrders: validNonDuplicateOrders,
          duplicateOrders: duplicateOrdersCount,
          invalidOrders: groupedOrders.filter(o => o.errors.length > 0).length,
          ordersWithMissingProducts, // 有缺失商品的訂單數
          totalItems: rows.filter(r => !r.error && r.productId).length,
          warningOrders: groupedOrders.filter(o => o.warnings.length > 0 && !o.isDuplicate).length,
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
      errors: [],
      warnings: [],
    }

    // 追蹤本次匯入中已創建的客戶（客戶名稱 -> 實際使用的客戶代碼）
    const createdCustomersMap = new Map<string, string>()

    // 處理要快速建立的商品
    const productsToCreateJson = formData.get('productsToCreate') as string | null
    if (productsToCreateJson) {
      try {
        const productsToCreate = JSON.parse(productsToCreateJson) as {
          barcode: string
          name: string
          price: number
        }[]

        for (const newProduct of productsToCreate) {
          // 建立商品
          const { data: createdProduct, error: createError } = await (supabaseServer
            .from('products') as any)
            .insert({
              barcode: newProduct.barcode,
              name: newProduct.name,
              price: newProduct.price,
              cost: 0,
              avg_cost: 0,
              stock: 0,
              is_active: true,
            })
            .select('id, barcode, name, price')
            .single()

          if (createError) {
            console.error(`[Sales Import] Failed to create product ${newProduct.barcode}:`, createError)
            result.warnings.push({
              orderNo: 'N/A',
              message: `建立商品「${newProduct.name}」失敗：${createError.message}`,
            })
          } else if (createdProduct) {
            console.log(`[Sales Import] Created product: ${createdProduct.name} (${createdProduct.barcode})`)
            // 加入到映射表中
            const barcodeStr = String(createdProduct.barcode || '').trim()
            if (barcodeStr) {
              barcodeToProduct.set(barcodeStr, { id: createdProduct.id, name: createdProduct.name, price: createdProduct.price })
            }
            nameToProduct.set(String(createdProduct.name).toLowerCase().trim(), { id: createdProduct.id, name: createdProduct.name, price: createdProduct.price })
          }
        }

        // 重新處理 rows，將缺失的商品 ID 補上
        for (const row of rows) {
          if (!row.productId && !row.error && row.barcode) {
            let product = barcodeToProduct.get(row.barcode)
            if (!product) {
              product = nameToProduct.get(row.barcode.toLowerCase())
            }
            if (product) {
              row.productId = product.id
              row.productName = product.name
              if (row.price === null) {
                row.price = product.price
              }
              row.warning = undefined // 清除警告
            }
          }
        }

        // 重新分組
        orderMap.clear()
        for (const row of rows) {
          if (!row.orderNo) continue

          if (!orderMap.has(row.orderNo)) {
            orderMap.set(row.orderNo, {
              orderNo: row.orderNo,
              customerCode: row.customerCode,
              customerName: row.customerName || row.customerCode,
              saleDate: row.saleDate,
              source: row.source,
              paymentMethod: row.paymentMethod,
              isPaid: row.isPaid,
              isShipped: row.isShipped,
              note: row.note,
              accountId: row.accountId || null,
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
              price: row.price || 0,
            })
          } else if (row.barcode && !row.productId) {
            order.errors.push(`第 ${row.rowNumber} 行：找不到商品「${row.barcode}」且未選擇建立`)
          }

          if (row.warning) {
            order.warnings.push(`第 ${row.rowNumber} 行：${row.warning}`)
          }
        }
      } catch (e) {
        console.error('[Sales Import] Failed to parse productsToCreate:', e)
      }
    }

    // 重新取得 groupedOrders
    const finalGroupedOrders = Array.from(orderMap.values())

    // sale_no 由資料庫 sequence 自動生成

    // 獲取最大 delivery_no 編號
    const { data: allDeliveries } = await (supabaseServer
      .from('deliveries') as any)
      .select('delivery_no')

    let deliveryNumber = 0
    if (allDeliveries && allDeliveries.length > 0) {
      const maxNumber = allDeliveries.reduce((max: number, delivery: any) => {
        const match = delivery.delivery_no.match(/\d+/)
        if (match) {
          const num = parseInt(match[0], 10)
          return num > max ? num : max
        }
        return max
      }, 0)
      deliveryNumber = maxNumber
    }

    // 處理每筆訂單
    for (const order of finalGroupedOrders) {
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

      try {
        // sale_no 由資料庫自動生成
        deliveryNumber++
        const deliveryNo = generateCode('D', deliveryNumber - 1)
        const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

        // 解析銷售日期
        let saleDate = new Date().toISOString().split('T')[0] // 預設當天
        let createdAt = getTaiwanTime()
        if (order.saleDate) {
          try {
            const parsedDate = new Date(order.saleDate)
            if (!isNaN(parsedDate.getTime())) {
              saleDate = parsedDate.toISOString().split('T')[0]
              // 設定為當天的中午 12:00（避免時區問題）
              parsedDate.setHours(12, 0, 0, 0)
              createdAt = parsedDate.toISOString()
            }
          } catch {
            // 使用當前時間
          }
        }

        // 檢查重複訂單
        const duplicateKey = `${saleDate}_${order.customerCode || ''}_${total}`
        const { data: existingDuplicate } = await (supabaseServer
          .from('sales') as any)
          .select('id, sale_no')
          .eq('sale_date', saleDate)
          .eq('customer_code', order.customerCode || '')
          .eq('total', total)
          .single()

        if (existingDuplicate) {
          const orderAction = duplicateActionsMap.get(order.orderNo) || 'skip'
          if (orderAction === 'skip') {
            result.warnings.push({
              orderNo: order.orderNo,
              message: `與 ${existingDuplicate.sale_no} 重複，已略過`,
            })
            deliveryNumber--
            continue
          } else if (orderAction === 'overwrite') {
            // 刪除舊的銷售單（包含關聯資料）
            try {
              // 先刪除 partner_accounts
              await (supabaseServer
                .from('partner_accounts') as any)
                .delete()
                .eq('ref_type', 'sale')
                .eq('ref_id', existingDuplicate.id)

              // 刪除 account_transactions
              await (supabaseServer
                .from('account_transactions') as any)
                .delete()
                .eq('ref_type', 'sale')
                .eq('ref_id', existingDuplicate.id)

              // 取得出貨單
              const { data: existingDeliveries } = await (supabaseServer
                .from('deliveries') as any)
                .select('id')
                .eq('sale_id', existingDuplicate.id)

              if (existingDeliveries) {
                for (const delivery of existingDeliveries) {
                  // 刪除出貨明細
                  await (supabaseServer
                    .from('delivery_items') as any)
                    .delete()
                    .eq('delivery_id', delivery.id)

                  // 刪除庫存日誌
                  await (supabaseServer
                    .from('inventory_logs') as any)
                    .delete()
                    .eq('ref_type', 'delivery')
                    .eq('ref_id', delivery.id)
                }

                // 刪除出貨單
                await (supabaseServer
                  .from('deliveries') as any)
                  .delete()
                  .eq('sale_id', existingDuplicate.id)
              }

              // 刪除銷售明細
              await (supabaseServer
                .from('sale_items') as any)
                .delete()
                .eq('sale_id', existingDuplicate.id)

              // 刪除銷售單
              await (supabaseServer
                .from('sales') as any)
                .delete()
                .eq('id', existingDuplicate.id)

              result.warnings.push({
                orderNo: order.orderNo,
                message: `已覆蓋舊訂單 ${existingDuplicate.sale_no}`,
              })
            } catch (deleteErr: any) {
              result.failed++
              result.errors.push({
                orderNo: order.orderNo,
                message: `刪除舊訂單失敗：${deleteErr.message}`,
              })
              deliveryNumber--
              continue
            }
          }
        }

        // 自動建立不存在的客戶（只需要客戶名稱）
        if (order.customerName && !customerNameSet.has(order.customerName.toLowerCase())) {
          // 檢查是否已在本次匯入中創建過（使用 createdCustomersMap）
          const existingCreatedCode = createdCustomersMap.get(order.customerName.toLowerCase())
          if (existingCreatedCode) {
            // 已創建過，直接使用已創建的代碼
            order.customerCode = existingCreatedCode
          } else {
            // 需要創建新客戶
            // 檢查客戶代碼是否已存在於資料庫，如果存在則重新生成
            let customerCode = order.customerCode

            // 查詢資料庫確認代碼是否真的存在
            const { data: existingByCode } = await (supabaseServer
              .from('customers') as any)
              .select('customer_code')
              .eq('customer_code', customerCode)
              .single()

            if (existingByCode) {
              // 代碼已存在，需要重新生成
              let attempts = 0
              do {
                maxCustomerNumber++
                customerCode = `C${String(maxCustomerNumber).padStart(3, '0')}`
                const { data: checkCode } = await (supabaseServer
                  .from('customers') as any)
                  .select('customer_code')
                  .eq('customer_code', customerCode)
                  .single()
                if (!checkCode) break
                attempts++
              } while (attempts < 100) // 防止無限循環
            }

            order.customerCode = customerCode

            const { error: createCustomerError } = await (supabaseServer
              .from('customers') as any)
              .insert({
                customer_code: customerCode,
                customer_name: order.customerName,
              })

            if (createCustomerError) {
              // 如果是重複 key 錯誤（可能是並發導致），重新檢查是否已存在
              const { data: existingCustomer } = await (supabaseServer
                .from('customers') as any)
                .select('customer_code')
                .or(`customer_code.eq.${customerCode},customer_name.ilike.${order.customerName}`)
                .single()

              if (existingCustomer) {
                // 客戶已存在，使用既有的代碼
                order.customerCode = existingCustomer.customer_code
                customerNameSet.add(order.customerName.toLowerCase())
                createdCustomersMap.set(order.customerName.toLowerCase(), existingCustomer.customer_code)
              } else {
                // 真的建立失敗，報錯並跳過此訂單
                result.failed++
                result.errors.push({
                  orderNo: order.orderNo,
                  message: `自動建立客戶「${order.customerName}」失敗：${createCustomerError.message}`,
                })
                continue
              }
            } else {
              // 建立成功，記錄已創建的客戶
              customerNameSet.add(order.customerName.toLowerCase())
              createdCustomersMap.set(order.customerName.toLowerCase(), customerCode!)
            }
          }
        }

        // 建立銷售單（sale_no 由資料庫自動生成）
        // fulfillment_status 根據 isShipped 決定
        const fulfillmentStatus = order.isShipped ? 'completed' : 'pending'
        const { data: sale, error: saleError } = await (supabaseServer
          .from('sales') as any)
          .insert({
            customer_code: order.customerCode,
            sale_date: saleDate,
            source: order.source,
            payment_method: order.paymentMethod,
            account_id: order.isPaid ? order.accountId : null,
            is_paid: order.isPaid,
            total,
            status: 'confirmed',
            fulfillment_status: fulfillmentStatus,
            note: order.note,
            created_at: createdAt,
          })
          .select()
          .single()

        if (saleError) {
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: `建立銷售單失敗：${saleError.message}`,
          })
          deliveryNumber--
          continue
        }

        // 建立銷售明細並獲取產品成本
        const saleItemsData = await Promise.all(
          order.items.map(async (item) => {
            const { data: product } = await (supabaseServer
              .from('products') as any)
              .select('avg_cost, cost')
              .eq('id', item.productId)
              .single()

            return {
              sale_id: sale.id,
              product_id: item.productId,
              quantity: item.quantity,
              price: item.price,
              cost: product?.avg_cost || product?.cost || 0,
              snapshot_name: '', // 稍後更新
            }
          })
        )

        // 獲取商品名稱
        for (const item of saleItemsData) {
          const { data: product } = await (supabaseServer
            .from('products') as any)
            .select('name')
            .eq('id', item.product_id)
            .single()
          item.snapshot_name = product?.name || ''
        }

        const { data: insertedSaleItems, error: itemsError } = await (supabaseServer
          .from('sale_items') as any)
          .insert(saleItemsData)
          .select()

        if (itemsError) {
          // 刪除已建立的銷售單
          await (supabaseServer.from('sales') as any).delete().eq('id', sale.id)
          result.failed++
          result.errors.push({
            orderNo: order.orderNo,
            message: `建立銷售明細失敗：${itemsError.message}`,
          })
          deliveryNumber--
          continue
        }

        // 只有已出貨才建立出貨單和扣庫存
        if (order.isShipped && insertedSaleItems) {
          const { data: delivery, error: deliveryError } = await (supabaseServer
            .from('deliveries') as any)
            .insert({
              delivery_no: deliveryNo,
              sale_id: sale.id,
              status: 'confirmed',
              delivery_date: createdAt,
              note: '匯入時自動建立',
            })
            .select()
            .single()

          if (!deliveryError && delivery) {
            // 建立出貨明細並扣庫存，關聯 sale_item_id
            for (let i = 0; i < order.items.length; i++) {
              const item = order.items[i]
              const saleItem = insertedSaleItems[i]

              // 建立出貨明細（包含 sale_item_id）
              await (supabaseServer
                .from('delivery_items') as any)
                .insert({
                  delivery_id: delivery.id,
                  sale_item_id: saleItem.id,
                  product_id: item.productId,
                  quantity: item.quantity,
                })

              // 建立庫存日誌（trigger 會自動扣庫存）
              await (supabaseServer
                .from('inventory_logs') as any)
                .insert({
                  product_id: item.productId,
                  ref_type: 'delivery',
                  ref_id: delivery.id,
                  qty_change: -item.quantity,
                  memo: `銷售出貨 ${sale.sale_no}`,
                })
            }
          }
        } else {
          // 未出貨，不遞增出貨單號
          deliveryNumber--
        }

        // 如果已付款，更新帳戶餘額
        if (order.isPaid && order.accountId) {
          const { data: account } = await (supabaseServer
            .from('accounts') as any)
            .select('balance')
            .eq('id', order.accountId)
            .single()

          if (account) {
            const newBalance = account.balance + total

            await (supabaseServer
              .from('accounts') as any)
              .update({
                balance: newBalance,
                updated_at: getTaiwanTime(),
              })
              .eq('id', order.accountId)

            // 建立帳戶交易記錄
            await (supabaseServer
              .from('account_transactions') as any)
              .insert({
                account_id: order.accountId,
                transaction_type: 'sale',
                amount: total,
                balance_before: account.balance,
                balance_after: newBalance,
                ref_type: 'sale',
                ref_id: sale.id,
                note: `匯入銷售單 ${sale.sale_no}`,
              })
          }
        }

        // 如果未付款且有客戶，建立應收帳款
        if (!order.isPaid && order.customerCode && insertedSaleItems) {
          // 計算每個商品的到期日（預設 7 天後）
          const dueDate = new Date()
          dueDate.setDate(dueDate.getDate() + 7)
          const dueDateStr = dueDate.toISOString().split('T')[0]

          // 為每個銷售明細創建 AR 記錄
          for (const saleItem of insertedSaleItems) {
            await (supabaseServer
              .from('partner_accounts') as any)
              .insert({
                partner_type: 'customer',
                partner_code: order.customerCode,
                direction: 'AR',
                ref_type: 'sale',
                ref_id: sale.id,
                sale_item_id: saleItem.id,
                amount: saleItem.subtotal || (saleItem.price * saleItem.quantity),
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
        deliveryNumber--
      }
    }

    return NextResponse.json({
      ok: true,
      preview: false,
      result,
    })
  } catch (error: any) {
    console.error('Failed to import sales:', error)
    return NextResponse.json(
      { ok: false, error: error.message || '匯入失敗' },
      { status: 500 }
    )
  }
}
