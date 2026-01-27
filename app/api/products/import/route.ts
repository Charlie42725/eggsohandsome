import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'
import { generateCode } from '@/lib/utils'
import * as XLSX from 'xlsx'

type ImportRow = {
  rowNumber: number
  name: string
  barcode: string | null
  price: number
  cost: number
  stock: number
  category: string | null
  error?: string
  warning?: string
  isDuplicate?: boolean  // 條碼重複標記
  existingProductId?: string  // 重複時的現有商品 ID
}

type ImportResult = {
  success: number
  failed: number
  errors: { row: number; message: string }[]
  warnings: { row: number; message: string }[]
}

// POST /api/products/import - 批量匯入商品
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
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json(
        { ok: false, error: '請上傳 .xlsx 或 .xls 檔案' },
        { status: 400 }
      )
    }

    // 讀取 Excel 檔案
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

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
      const normalizedHeader = header.toLowerCase()
      if (normalizedHeader.includes('商品名稱') || normalizedHeader === 'name' || normalizedHeader === '名稱') {
        columnMap['name'] = index
      } else if (normalizedHeader.includes('條碼') || normalizedHeader === 'barcode') {
        columnMap['barcode'] = index
      } else if (normalizedHeader.includes('售價') || normalizedHeader === 'price' || normalizedHeader === '價格') {
        columnMap['price'] = index
      } else if (normalizedHeader.includes('成本') || normalizedHeader.includes('進價') || normalizedHeader.includes('進貨價') || normalizedHeader.includes('採購價') || normalizedHeader.includes('庫成本') || normalizedHeader === 'cost') {
        columnMap['cost'] = index
      } else if (normalizedHeader.includes('庫存') || normalizedHeader === 'stock' || normalizedHeader === '數量') {
        columnMap['stock'] = index
      } else if (normalizedHeader.includes('分類') || normalizedHeader === 'category') {
        columnMap['category'] = index
      }
    })

    // 條碼欄位為選填，不再強制要求

    // 獲取所有分類（用於名稱對應 ID）
    const { data: categories } = await (supabaseServer
      .from('categories') as any)
      .select('id, name')

    const categoryMap = new Map<string, string>()
    if (categories) {
      categories.forEach((cat: any) => {
        categoryMap.set(cat.name.toLowerCase(), cat.id)
      })
    }

    // 獲取所有現有商品（用於檢查重複）
    const { data: existingProducts } = await (supabaseServer
      .from('products') as any)
      .select('id, barcode')
      .not('barcode', 'is', null)

    const existingBarcodeMap = new Map<string, string>()  // barcode -> product id
    if (existingProducts) {
      existingProducts.forEach((p: any) => {
        if (p.barcode) existingBarcodeMap.set(p.barcode, p.id)
      })
    }

    // 解析資料列
    const rows: ImportRow[] = []
    const newBarcodes = new Set<string>()

    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || row.length === 0) continue

      const name = columnMap['name'] !== undefined ? String(row[columnMap['name']] || '').trim() : ''
      const barcode = columnMap['barcode'] !== undefined ? String(row[columnMap['barcode']] || '').trim() || null : null
      const price = columnMap['price'] !== undefined ? parseFloat(row[columnMap['price']]) || 0 : 0
      const cost = columnMap['cost'] !== undefined ? parseFloat(row[columnMap['cost']]) || 0 : 0
      const stock = columnMap['stock'] !== undefined ? parseInt(row[columnMap['stock']]) || 0 : 0
      const category = columnMap['category'] !== undefined ? String(row[columnMap['category']] || '').trim() || null : null

      const importRow: ImportRow = {
        rowNumber: i + 1,
        name,
        barcode,
        price,
        cost,
        stock,
        category,
      }

      // 驗證：條碼為選填，但如果有條碼則檢查是否重複
      if (barcode) {
        const existingProductId = existingBarcodeMap.get(barcode)
        if (existingProductId) {
          // 條碼已存在，標記為重複（讓用戶選擇處理方式）
          importRow.isDuplicate = true
          importRow.existingProductId = existingProductId
          importRow.warning = `條碼 ${barcode} 已存在，可選擇覆蓋或略過`
        } else if (newBarcodes.has(barcode)) {
          importRow.error = `條碼 ${barcode} 在檔案中重複`
        } else {
          newBarcodes.add(barcode)
        }
      }

      // 如果商品名稱為空，使用條碼作為名稱；如果兩者皆空則報錯
      if (!importRow.error && !importRow.name) {
        if (barcode) {
          importRow.name = barcode
        } else {
          importRow.error = '商品名稱不能為空（條碼為空時必須填寫商品名稱）'
        }
      }

      if (category && !categoryMap.has(category.toLowerCase())) {
        importRow.warning = `分類「${category}」不存在，將不設定分類`
      }

      rows.push(importRow)
    }

    // 只做預覽，不實際匯入
    const preview = formData.get('preview') === 'true'
    if (preview) {
      const duplicateCount = rows.filter(r => r.isDuplicate).length
      return NextResponse.json({
        ok: true,
        preview: true,
        data: rows,
        summary: {
          total: rows.length,
          valid: rows.filter(r => !r.error && !r.isDuplicate).length,
          invalid: rows.filter(r => r.error).length,
          duplicates: duplicateCount,
          warnings: rows.filter(r => r.warning && !r.isDuplicate).length,
        }
      })
    }

    // 處理重複資料的方式（每個品項單獨設定）
    type DuplicateActionItem = { rowNumber: number; barcode: string; action: 'skip' | 'overwrite' }
    let duplicateActionsMap = new Map<number, 'skip' | 'overwrite'>()
    const duplicateActionsJson = formData.get('duplicateActions') as string | null
    if (duplicateActionsJson) {
      try {
        const duplicateActions: DuplicateActionItem[] = JSON.parse(duplicateActionsJson)
        duplicateActions.forEach(da => {
          duplicateActionsMap.set(da.rowNumber, da.action)
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

    // 獲取最大 item_code 編號
    const { data: lastProduct } = await (supabaseServer
      .from('products') as any)
      .select('item_code')
      .like('item_code', 'I%')
      .order('item_code', { ascending: false })
      .limit(1)

    let maxNumber = 0
    if (lastProduct && lastProduct.length > 0) {
      const match = lastProduct[0].item_code.match(/^I(\d+)$/)
      if (match) {
        maxNumber = parseInt(match[1])
      }
    }

    // 處理有效的商品（不含錯誤的）
    const validRows = rows.filter(r => !r.error)

    for (const row of validRows) {
      try {
        // 處理重複的商品
        if (row.isDuplicate && row.existingProductId) {
          const rowAction = duplicateActionsMap.get(row.rowNumber) || 'skip'
          if (rowAction === 'skip') {
            // 略過重複的商品
            result.warnings.push({
              row: row.rowNumber,
              message: `條碼 ${row.barcode} 已存在，已略過`,
            })
            continue
          } else if (rowAction === 'overwrite') {
            // 覆蓋現有商品
            const categoryId = row.category
              ? categoryMap.get(row.category.toLowerCase()) || null
              : null

            const updateData: any = {
              name: row.name,
              price: row.price,
              cost: row.cost,
              stock: row.stock,
              avg_cost: row.cost,
              category_id: categoryId,
            }

            const { error } = await (supabaseServer
              .from('products') as any)
              .update(updateData)
              .eq('id', row.existingProductId)

            if (error) {
              result.failed++
              result.errors.push({
                row: row.rowNumber,
                message: `覆蓋失敗：${error.message}`,
              })
            } else {
              result.success++
              result.warnings.push({
                row: row.rowNumber,
                message: `條碼 ${row.barcode} 已覆蓋更新`,
              })
            }
            continue
          }
        }

        // 新增商品
        maxNumber++
        const itemCode = generateCode('I', maxNumber - 1) // generateCode 會加 1

        const categoryId = row.category
          ? categoryMap.get(row.category.toLowerCase()) || null
          : null

        const insertData: any = {
          item_code: itemCode,
          name: row.name,
          barcode: row.barcode,
          price: row.price,
          cost: row.cost,
          stock: row.stock,
          avg_cost: row.cost,  // 直接使用成本，不管庫存是否為 0
          category_id: categoryId,
          unit: '件',
          is_active: true,
        }

        const { error } = await (supabaseServer
          .from('products') as any)
          .insert(insertData)

        if (error) {
          result.failed++
          result.errors.push({
            row: row.rowNumber,
            message: error.message,
          })
          maxNumber-- // 回退編號
        } else {
          result.success++
          if (row.warning) {
            result.warnings.push({
              row: row.rowNumber,
              message: row.warning,
            })
          }
        }
      } catch (err: any) {
        result.failed++
        result.errors.push({
          row: row.rowNumber,
          message: err.message || '未知錯誤',
        })
        maxNumber--
      }
    }

    // 加入原本就有錯誤的行
    for (const row of rows.filter(r => r.error)) {
      result.failed++
      result.errors.push({
        row: row.rowNumber,
        message: row.error!,
      })
    }

    return NextResponse.json({
      ok: true,
      preview: false,
      result,
    })
  } catch (error: any) {
    console.error('Failed to import products:', error)
    return NextResponse.json(
      { ok: false, error: error.message || '匯入失敗' },
      { status: 500 }
    )
  }
}
