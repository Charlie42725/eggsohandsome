'use client'

import { useState, useRef, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'

type PreviewOrder = {
  orderNo: string
  vendorCode: string | null
  purchaseDate: string | null
  isPaid: boolean
  note: string | null
  itemCount: number
  total: number
  errors: string[]
  warnings: string[]
  rowNumbers: number[]
}

type ImportSummary = {
  totalOrders: number
  validOrders: number
  invalidOrders: number
  totalItems: number
  warningOrders: number
}

type ImportResult = {
  success: number
  failed: number
  errors: { orderNo: string; message: string }[]
  warnings: { orderNo: string; message: string }[]
}

interface PurchaseImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function PurchaseImportModal({ isOpen, onClose, onSuccess }: PurchaseImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewOrder[] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setPreviewData(null)
    setSummary(null)
    setImportResult(null)
    setError(null)
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

      const res = await fetch('/api/purchases/import', {
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

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('preview', 'false')

      const res = await fetch('/api/purchases/import', {
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
      ['訂單編號', '廠商代碼', '廠商名稱', '進貨日期', '是否已付款', '商品條碼', '數量', '進貨價', '備註'],
      ['PO-001', 'V001', '', '2026-01-15', '是', '4710088012345', 10, 100, '首批進貨'],
      ['PO-001', 'V001', '', '2026-01-15', '是', '4710088012346', 5, 150, ''],
      ['PO-002', '', '萬代', '2026-01-16', '否', '4710088012345', 20, 95, '月結'],
    ]

    // 建立工作表
    const ws = XLSX.utils.aoa_to_sheet(templateData)

    // 設定欄寬
    ws['!cols'] = [
      { wch: 12 }, // 訂單編號
      { wch: 10 }, // 廠商代碼
      { wch: 12 }, // 廠商名稱
      { wch: 12 }, // 進貨日期
      { wch: 10 }, // 是否已付款
      { wch: 15 }, // 商品條碼
      { wch: 6 },  // 數量
      { wch: 10 }, // 進貨價
      { wch: 15 }, // 備註
    ]

    // 建立工作簿
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '進貨匯入')

    // 下載檔案
    XLSX.writeFile(wb, 'purchase-import-template.xlsx')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">匯入進貨紀錄</h2>
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
                <div className="text-4xl mb-3">📦</div>
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
                    <tr><td className="py-1">訂單編號</td><td>必填</td><td>用於分組，相同編號會合併為一筆進貨單</td></tr>
                    <tr><td className="py-1">廠商代碼/名稱</td><td>必填</td><td>必須為已存在的廠商</td></tr>
                    <tr><td className="py-1">進貨日期</td><td>選填</td><td>格式 YYYY-MM-DD，預設當天</td></tr>
                    <tr><td className="py-1">是否已付款</td><td>選填</td><td>是/否，預設 否（建立應付帳款）</td></tr>
                    <tr><td className="py-1">商品條碼</td><td>必填</td><td>商品條碼或貨號</td></tr>
                    <tr><td className="py-1">數量</td><td>必填</td><td>必須為正整數</td></tr>
                    <tr><td className="py-1">進貨價</td><td>選填</td><td>不填則使用商品成本</td></tr>
                    <tr><td className="py-1">備註</td><td>選填</td><td>訂單備註</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Preview Data */}
          {previewData && !importResult && (
            <>
              {/* Summary */}
              {summary && (
                <div className="mb-4 flex gap-4 flex-wrap">
                  <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400 text-sm">訂單數：</span>
                    <span className="font-bold text-gray-900 dark:text-white ml-1">{summary.totalOrders} 筆</span>
                  </div>
                  <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <span className="text-green-600 dark:text-green-400 text-sm">可匯入：</span>
                    <span className="font-bold text-green-700 dark:text-green-300 ml-1">{summary.validOrders} 筆</span>
                  </div>
                  {summary.invalidOrders > 0 && (
                    <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <span className="text-red-600 dark:text-red-400 text-sm">錯誤：</span>
                      <span className="font-bold text-red-700 dark:text-red-300 ml-1">{summary.invalidOrders} 筆</span>
                    </div>
                  )}
                  {summary.warningOrders > 0 && (
                    <div className="px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <span className="text-yellow-600 dark:text-yellow-400 text-sm">警告：</span>
                      <span className="font-bold text-yellow-700 dark:text-yellow-300 ml-1">{summary.warningOrders} 筆</span>
                    </div>
                  )}
                  <div className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <span className="text-blue-600 dark:text-blue-400 text-sm">商品明細：</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300 ml-1">{summary.totalItems} 項</span>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">訂單編號</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">廠商</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">日期</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">付款狀態</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">品項</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">金額</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {previewData.map((order) => (
                        <tr
                          key={order.orderNo}
                          className={`${
                            order.errors.length > 0
                              ? 'bg-red-50 dark:bg-red-900/20'
                              : order.warnings.length > 0
                              ? 'bg-yellow-50 dark:bg-yellow-900/20'
                              : 'bg-white dark:bg-gray-800'
                          }`}
                        >
                          <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{order.orderNo}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{order.vendorCode || '-'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{order.purchaseDate || '今天'}</td>
                          <td className="px-3 py-2">
                            <span className={`${order.isPaid ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                              {order.isPaid ? '已付款' : '未付款'}
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
                      ))}
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
                <button
                  onClick={handleImport}
                  disabled={loading || (summary?.validOrders || 0) === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '匯入中...' : `確認匯入 (${summary?.validOrders || 0} 筆訂單)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
