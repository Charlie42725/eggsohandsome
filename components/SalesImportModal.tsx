'use client'

import { useState, useRef, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'

type PreviewOrder = {
  orderNo: string
  customerCode: string | null
  saleDate: string | null
  source: string
  paymentMethod: string
  isPaid: boolean
  note: string | null
  itemCount: number
  total: number
  errors: string[]
  warnings: string[]
  rowNumbers: number[]
  isDuplicate?: boolean
  existingSaleNo?: string
}

type MissingProduct = {
  barcode: string
  suggestedName: string
  suggestedPrice: number | null
  rowNumbers: number[]
}

type ProductToCreate = {
  barcode: string
  name: string
  price: number
  selected: boolean
}

type ImportSummary = {
  totalOrders: number
  validOrders: number
  duplicateOrders?: number
  invalidOrders: number
  ordersWithMissingProducts?: number
  totalItems: number
  warningOrders: number
}

// 每個重複訂單的處理方式
type DuplicateAction = {
  orderNo: string
  action: 'skip' | 'overwrite'
}

type ImportResult = {
  success: number
  failed: number
  errors: { orderNo: string; message: string }[]
  warnings: { orderNo: string; message: string }[]
}

interface SalesImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function SalesImportModal({ isOpen, onClose, onSuccess }: SalesImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewOrder[] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [missingProducts, setMissingProducts] = useState<MissingProduct[]>([])
  const [productsToCreate, setProductsToCreate] = useState<ProductToCreate[]>([])
  const [duplicateActions, setDuplicateActions] = useState<DuplicateAction[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setPreviewData(null)
    setSummary(null)
    setImportResult(null)
    setError(null)
    setMissingProducts([])
    setProductsToCreate([])
    setDuplicateActions([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [])

  const handleFileSelect = async (selectedFile: File) => {
    setError(null)
    setImportResult(null)

    const fileName = selectedFile.name.toLowerCase()
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
      setError('請選擇 .xlsx、.xls 或 .csv 檔案')
      return
    }

    setFile(selectedFile)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('preview', 'true')

      const res = await fetch('/api/sales/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error || '解析檔案失敗')
        setFile(null)
      } else {
        setPreviewData(data.data)
        setSummary(data.summary)
        // 處理找不到的商品
        if (data.missingProducts && data.missingProducts.length > 0) {
          setMissingProducts(data.missingProducts)
          // 初始化要建立的商品清單（預設全選）
          setProductsToCreate(data.missingProducts.map((p: MissingProduct) => ({
            barcode: p.barcode,
            name: p.suggestedName,
            price: p.suggestedPrice || 0,
            selected: true,
          })))
        } else {
          setMissingProducts([])
          setProductsToCreate([])
        }
        // 初始化每個重複訂單的處理方式（預設為略過）
        const duplicates = (data.data as PreviewOrder[]).filter(o => o.isDuplicate)
        setDuplicateActions(duplicates.map(o => ({
          orderNo: o.orderNo,
          action: 'skip' as const,
        })))
      }
    } catch (err: any) {
      setError(err.message || '解析檔案失敗')
      setFile(null)
    } finally {
      setLoading(false)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  // 更新單一訂單的處理方式
  const updateDuplicateAction = (orderNo: string, action: 'skip' | 'overwrite') => {
    setDuplicateActions(prev =>
      prev.map(da => da.orderNo === orderNo ? { ...da, action } : da)
    )
  }

  // 批量設定所有重複訂單的處理方式
  const setAllDuplicateActions = (action: 'skip' | 'overwrite') => {
    setDuplicateActions(prev => prev.map(da => ({ ...da, action })))
  }

  // 取得某訂單的處理方式
  const getOrderAction = (orderNo: string): 'skip' | 'overwrite' | null => {
    const action = duplicateActions.find(da => da.orderNo === orderNo)
    return action?.action || null
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('preview', 'false')

      // 附加要建立的商品
      const selectedProducts = productsToCreate.filter(p => p.selected)
      if (selectedProducts.length > 0) {
        formData.append('productsToCreate', JSON.stringify(selectedProducts.map(p => ({
          barcode: p.barcode,
          name: p.name,
          price: p.price,
        }))))
      }

      // 傳送每個訂單的處理方式
      formData.append('duplicateActions', JSON.stringify(duplicateActions))

      const res = await fetch('/api/sales/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error || '匯入失敗')
      } else {
        setImportResult(data.result)
        if (data.result.success > 0) {
          onSuccess()
        }
      }
    } catch (err: any) {
      setError(err.message || '匯入失敗')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = async () => {
    // 動態載入 xlsx 庫
    const XLSX = await import('xlsx')

    // 建立範本資料
    const templateData = [
      ['訂單編號', '客戶', '銷售日期', '來源', '付款方式', '是否已付款', '商品（條碼/品號/名稱）', '數量', '售價', '備註'],
      ['ORD-001', '王小明', '2026-01-15', 'live', '現金', '是', '4710088012345', 2, 199, '用條碼匹配'],
      ['ORD-001', '王小明', '2026-01-15', 'live', '現金', '是', 'A001', 1, 299, '用品號匹配'],
      ['ORD-002', '李大華', '2026-01-16', 'pos', 'pending', '否', '海賊王公仔', 3, 199, '用商品名稱匹配'],
      ['ORD-003', '新客戶', '2026-01-17', 'manual', '', '否', '新商品名稱', 1, 500, '客戶和商品都會自動建立'],
    ]

    // 建立工作表
    const ws = XLSX.utils.aoa_to_sheet(templateData)

    // 設定欄寬
    ws['!cols'] = [
      { wch: 12 }, // 訂單編號
      { wch: 12 }, // 客戶
      { wch: 12 }, // 銷售日期
      { wch: 8 },  // 來源
      { wch: 10 }, // 付款方式
      { wch: 10 }, // 是否已付款
      { wch: 22 }, // 商品（條碼/品號/名稱）
      { wch: 6 },  // 數量
      { wch: 8 },  // 售價
      { wch: 15 }, // 備註
    ]

    // 建立工作簿
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '銷貨匯入')

    // 下載檔案
    XLSX.writeFile(wb, 'sales-import-template.xlsx')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">匯入銷貨紀錄</h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
              <h3 className="font-bold text-green-800 dark:text-green-300 mb-2">匯入完成</h3>
              <div className="text-green-700 dark:text-green-400">
                <p>成功：{importResult.success} 筆訂單</p>
                <p>失敗：{importResult.failed} 筆訂單</p>
              </div>
              {importResult.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">處理詳情：</p>
                  <ul className="text-sm text-orange-600 dark:text-orange-400 list-disc list-inside max-h-32 overflow-auto">
                    {importResult.warnings.slice(0, 10).map((warn, i) => (
                      <li key={i}>訂單 {warn.orderNo}：{warn.message}</li>
                    ))}
                    {importResult.warnings.length > 10 && (
                      <li>...還有 {importResult.warnings.length - 10} 條</li>
                    )}
                  </ul>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">錯誤詳情：</p>
                  <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside max-h-32 overflow-auto">
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>訂單 {err.orderNo}：{err.message}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...還有 {importResult.errors.length - 10} 個錯誤</li>
                    )}
                  </ul>
                </div>
              )}
              <button
                onClick={handleClose}
                className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                完成
              </button>
            </div>
          )}

          {/* File Upload Area */}
          {!importResult && !previewData && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <div className="text-4xl mb-3">📊</div>
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                  {loading ? '解析中...' : '拖放 Excel 檔案至此處'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  或點擊選擇檔案（支援 .xlsx, .xls, .csv）
                </p>
              </div>

              <div className="mt-4 flex justify-center">
                <button
                  onClick={downloadTemplate}
                  className="text-blue-600 dark:text-blue-400 hover:underline text-sm flex items-center gap-1"
                >
                  <span>📥</span> 下載匯入範本
                </button>
              </div>

              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">欄位說明</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2">欄位名稱</th>
                      <th className="pb-2">必填</th>
                      <th className="pb-2">說明</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700 dark:text-gray-300">
                    <tr><td className="py-1">訂單編號</td><td>必填</td><td>用於分組，相同編號會合併為一筆銷售</td></tr>
                    <tr><td className="py-1">客戶</td><td>選填</td><td>填<b>客戶名稱</b>即可，空白為散客，不存在會自動建立</td></tr>
                    <tr><td className="py-1">銷售日期</td><td>選填</td><td>格式 YYYY-MM-DD，預設當天</td></tr>
                    <tr><td className="py-1">來源</td><td>選填</td><td>pos/live/manual，預設 manual</td></tr>
                    <tr><td className="py-1">付款方式</td><td>選填</td><td>帳戶名稱，預設 pending（待收款）</td></tr>
                    <tr><td className="py-1">是否已付款</td><td>選填</td><td>是/否，預設 否</td></tr>
                    <tr><td className="py-1">商品</td><td>必填</td><td><b>條碼、品號、商品名稱</b>擇一，找不到可快速建立</td></tr>
                    <tr><td className="py-1">數量</td><td>必填</td><td>必須為正整數</td></tr>
                    <tr><td className="py-1">售價</td><td>選填</td><td>不填則使用商品定價</td></tr>
                    <tr><td className="py-1">備註</td><td>選填</td><td>訂單備註</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Preview Data */}
          {previewData && !importResult && (
            <>
              {/* Duplicate Action Quick Selection */}
              {summary && (summary.duplicateOrders || 0) > 0 && (
                <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg">
                  <h3 className="font-bold text-orange-800 dark:text-orange-300 mb-2">
                    發現 {summary.duplicateOrders} 筆可能重複的訂單
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mb-3">
                    相同日期、客戶、金額的訂單已標記為可能重複。可在下方表格中為每筆單獨選擇處理方式，或使用快速操作：
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAllDuplicateActions('skip')}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        duplicateActions.filter(da => da.action === 'skip').length === duplicateActions.length
                          ? 'bg-orange-200 dark:bg-orange-800 border-orange-400 dark:border-orange-600'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                      }`}
                    >
                      全部略過
                    </button>
                    <button
                      onClick={() => setAllDuplicateActions('overwrite')}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        duplicateActions.filter(da => da.action === 'overwrite').length === duplicateActions.length
                          ? 'bg-orange-200 dark:bg-orange-800 border-orange-400 dark:border-orange-600'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                      }`}
                    >
                      全部覆蓋
                    </button>
                  </div>
                </div>
              )}

              {/* Missing Products - Quick Create */}
              {missingProducts.length > 0 && (
                <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg">
                  <h3 className="font-bold text-orange-800 dark:text-orange-300 mb-2 flex items-center gap-2">
                    <span>⚠️</span> 找不到以下商品（{missingProducts.length} 項）
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mb-3">
                    勾選並填寫資料後，將在匯入時自動建立這些商品
                  </p>
                  <div className="space-y-2 max-h-48 overflow-auto">
                    {productsToCreate.map((product, index) => (
                      <div
                        key={product.barcode}
                        className={`flex items-center gap-3 p-2 rounded-lg ${
                          product.selected ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-gray-100 dark:bg-gray-700/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={product.selected}
                          onChange={(e) => {
                            const newProducts = [...productsToCreate]
                            newProducts[index].selected = e.target.checked
                            setProductsToCreate(newProducts)
                          }}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">條碼/識別碼</label>
                            <div className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">
                              {product.barcode}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">商品名稱</label>
                            <input
                              type="text"
                              value={product.name}
                              onChange={(e) => {
                                const newProducts = [...productsToCreate]
                                newProducts[index].name = e.target.value
                                setProductsToCreate(newProducts)
                              }}
                              disabled={!product.selected}
                              className="w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                              placeholder="輸入商品名稱"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400">售價</label>
                            <input
                              type="number"
                              value={product.price}
                              onChange={(e) => {
                                const newProducts = [...productsToCreate]
                                newProducts[index].price = parseFloat(e.target.value) || 0
                                setProductsToCreate(newProducts)
                              }}
                              disabled={!product.selected}
                              className="w-full text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                              placeholder="0"
                              min="0"
                            />
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {missingProducts.find(m => m.barcode === product.barcode)?.rowNumbers.length || 0} 筆
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setProductsToCreate(productsToCreate.map(p => ({ ...p, selected: true })))}
                      className="text-xs px-2 py-1 text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      全選
                    </button>
                    <button
                      onClick={() => setProductsToCreate(productsToCreate.map(p => ({ ...p, selected: false })))}
                      className="text-xs px-2 py-1 text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      全不選
                    </button>
                  </div>
                </div>
              )}

              {/* Summary */}
              {summary && (() => {
                const overwriteCount = duplicateActions.filter(da => da.action === 'overwrite').length
                const skipCount = duplicateActions.filter(da => da.action === 'skip').length
                return (
                  <div className="mb-4 flex gap-4 flex-wrap">
                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <span className="text-gray-500 dark:text-gray-400 text-sm">訂單數：</span>
                      <span className="font-bold text-gray-900 dark:text-white ml-1">{summary.totalOrders} 筆</span>
                    </div>
                    <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <span className="text-green-600 dark:text-green-400 text-sm">新增：</span>
                      <span className="font-bold text-green-700 dark:text-green-300 ml-1">{summary.validOrders} 筆</span>
                    </div>
                    {(summary.duplicateOrders || 0) > 0 && (
                      <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                        <span className="text-orange-600 dark:text-orange-400 text-sm">重複：</span>
                        <span className="font-bold text-orange-700 dark:text-orange-300 ml-1">
                          {summary.duplicateOrders} 筆（{overwriteCount} 覆蓋 / {skipCount} 略過）
                        </span>
                      </div>
                    )}
                    {summary.invalidOrders > 0 && (
                      <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <span className="text-red-600 dark:text-red-400 text-sm">錯誤：</span>
                        <span className="font-bold text-red-700 dark:text-red-300 ml-1">{summary.invalidOrders} 筆</span>
                      </div>
                    )}
                    {missingProducts.length > 0 && (
                      <div className="px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                        <span className="text-yellow-600 dark:text-yellow-400 text-sm">待建立商品：</span>
                        <span className="font-bold text-yellow-700 dark:text-yellow-300 ml-1">{missingProducts.length} 項</span>
                      </div>
                    )}
                    <div className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <span className="text-blue-600 dark:text-blue-400 text-sm">商品明細：</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300 ml-1">{summary.totalItems} 項</span>
                    </div>
                  </div>
                )
              })()}

              {/* Preview Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">訂單編號</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">客戶</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">日期</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">來源</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">付款</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">品項</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">金額</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">狀態/處理</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {previewData.map((order) => {
                        const orderAction = getOrderAction(order.orderNo)
                        return (
                          <tr
                            key={order.orderNo}
                            className={`${
                              order.errors.length > 0
                                ? 'bg-red-50 dark:bg-red-900/20'
                                : order.isDuplicate
                                ? 'bg-orange-50 dark:bg-orange-900/20'
                                : order.warnings.length > 0
                                ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                : 'bg-white dark:bg-gray-800'
                            }`}
                          >
                            <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{order.orderNo}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{order.customerCode || '散客'}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{order.saleDate || '今天'}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {order.source === 'pos' ? '店裡' : order.source === 'live' ? '直播' : '手動'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 ${order.isPaid ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                {order.isPaid ? '已付' : '未付'}
                                <span className="text-gray-400 text-xs">({order.paymentMethod})</span>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{order.itemCount}</td>
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-white font-medium">{formatCurrency(order.total)}</td>
                            <td className="px-3 py-2">
                              {order.errors.length > 0 ? (
                                <div className="text-red-600 dark:text-red-400 text-xs">
                                  {order.errors.map((e, i) => (
                                    <div key={i}>{e}</div>
                                  ))}
                                </div>
                              ) : order.isDuplicate ? (
                                <div>
                                  <div className="text-orange-600 dark:text-orange-400 text-xs mb-1">
                                    可能與 {order.existingSaleNo} 重複
                                  </div>
                                  <select
                                    value={orderAction || 'skip'}
                                    onChange={(e) => updateDuplicateAction(order.orderNo, e.target.value as 'skip' | 'overwrite')}
                                    className="text-xs px-2 py-1 rounded border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300"
                                  >
                                    <option value="skip">略過（保留原有）</option>
                                    <option value="overwrite">覆蓋（刪除舊的）</option>
                                  </select>
                                </div>
                              ) : order.warnings.length > 0 ? (
                                <div className="text-yellow-600 dark:text-yellow-400 text-xs">
                                  {order.warnings.map((w, i) => (
                                    <div key={i}>{w}</div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-green-600 dark:text-green-400 text-xs">可匯入</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={reset}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  重新選擇檔案
                </button>
                {(() => {
                  // 計算可匯入的訂單數
                  const selectedProductBarcodes = new Set(
                    productsToCreate.filter(p => p.selected).map(p => p.barcode.toLowerCase())
                  )
                  const overwriteCount = duplicateActions.filter(da => da.action === 'overwrite').length
                  // 原本可匯入的 + 選擇建立商品後可匯入的 + 覆蓋的重複訂單
                  const newCount = summary?.validOrders || 0
                  const totalToProcess = newCount + overwriteCount
                  const canImport = totalToProcess > 0 || selectedProductBarcodes.size > 0

                  let actionText = ''
                  if (selectedProductBarcodes.size > 0) {
                    actionText = `確認匯入（含建立 ${selectedProductBarcodes.size} 項商品）`
                  } else if (overwriteCount > 0) {
                    actionText = `確認匯入（${newCount} 新增 + ${overwriteCount} 覆蓋）`
                  } else {
                    actionText = `確認匯入 (${newCount} 筆訂單)`
                  }

                  return (
                    <button
                      onClick={handleImport}
                      disabled={loading || !canImport}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? '匯入中...' : actionText}
                    </button>
                  )
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
