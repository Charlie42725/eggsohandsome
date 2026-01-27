'use client'

import { useState, useRef, useCallback } from 'react'
import { formatCurrency } from '@/lib/utils'

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
  isDuplicate?: boolean
  existingProductId?: string
}

type ImportSummary = {
  total: number
  valid: number
  invalid: number
  duplicates: number
  warnings: number
}

type ImportResult = {
  success: number
  failed: number
  errors: { row: number; message: string }[]
  warnings: { row: number; message: string }[]
}

// 每個重複品項的處理方式
type DuplicateAction = {
  rowNumber: number
  barcode: string
  action: 'skip' | 'overwrite'
}

interface ProductImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function ProductImportModal({ isOpen, onClose, onSuccess }: ProductImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewData, setPreviewData] = useState<ImportRow[] | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [duplicateActions, setDuplicateActions] = useState<DuplicateAction[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFile(null)
    setPreviewData(null)
    setSummary(null)
    setImportResult(null)
    setError(null)
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
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setError('請選擇 .xlsx 或 .xls 檔案')
      return
    }

    setFile(selectedFile)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('preview', 'true')

      const res = await fetch('/api/products/import', {
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
        // 初始化每個重複品項的處理方式（預設為略過）
        const duplicates = (data.data as ImportRow[]).filter(r => r.isDuplicate)
        setDuplicateActions(duplicates.map(r => ({
          rowNumber: r.rowNumber,
          barcode: r.barcode || '',
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

  // 更新單一品項的處理方式
  const updateDuplicateAction = (rowNumber: number, action: 'skip' | 'overwrite') => {
    setDuplicateActions(prev =>
      prev.map(da => da.rowNumber === rowNumber ? { ...da, action } : da)
    )
  }

  // 批量設定所有重複品項的處理方式
  const setAllDuplicateActions = (action: 'skip' | 'overwrite') => {
    setDuplicateActions(prev => prev.map(da => ({ ...da, action })))
  }

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('preview', 'false')
      // 傳送每個品項的處理方式
      formData.append('duplicateActions', JSON.stringify(duplicateActions))

      const res = await fetch('/api/products/import', {
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
      ['條碼', '商品名稱', '售價', '成本', '庫存', '分類'],
      ['4710088012345', '範例商品', 199, 100, 10, '玩具'],
      ['4710088012346', '範例商品2', 299, 150, 5, ''],
    ]

    // 建立工作表
    const ws = XLSX.utils.aoa_to_sheet(templateData)

    // 設定欄寬
    ws['!cols'] = [
      { wch: 15 }, // 條碼
      { wch: 20 }, // 商品名稱
      { wch: 10 }, // 售價
      { wch: 10 }, // 成本
      { wch: 8 },  // 庫存
      { wch: 12 }, // 分類
    ]

    // 建立工作簿
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '商品匯入')

    // 下載檔案
    XLSX.writeFile(wb, 'product-import-template.xlsx')
  }

  // 取得某行的處理方式
  const getRowAction = (rowNumber: number): 'skip' | 'overwrite' | null => {
    const action = duplicateActions.find(da => da.rowNumber === rowNumber)
    return action?.action || null
  }

  if (!isOpen) return null

  const overwriteCount = duplicateActions.filter(da => da.action === 'overwrite').length
  const skipCount = duplicateActions.filter(da => da.action === 'skip').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">匯入商品</h2>
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
                <p>成功：{importResult.success} 筆</p>
                <p>失敗：{importResult.failed} 筆</p>
              </div>
              {importResult.warnings.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">處理詳情：</p>
                  <ul className="text-sm text-orange-600 dark:text-orange-400 list-disc list-inside max-h-32 overflow-auto">
                    {importResult.warnings.slice(0, 10).map((warn, i) => (
                      <li key={i}>第 {warn.row} 行：{warn.message}</li>
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
                      <li key={i}>第 {err.row} 行：{err.message}</li>
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
                    <tr><td className="py-1">條碼</td><td>❌</td><td>商品條碼（不可重複，可為空）</td></tr>
                    <tr><td className="py-1">商品名稱</td><td>⚠️</td><td>商品名稱（條碼為空時必填）</td></tr>
                    <tr><td className="py-1">售價</td><td>❌</td><td>預設 0</td></tr>
                    <tr><td className="py-1">成本</td><td>❌</td><td>預設 0</td></tr>
                    <tr><td className="py-1">庫存</td><td>❌</td><td>預設 0</td></tr>
                    <tr><td className="py-1">分類</td><td>❌</td><td>分類名稱（需已存在）</td></tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Preview Data */}
          {previewData && !importResult && (
            <>
              {/* Duplicate Action Quick Selection */}
              {summary && summary.duplicates > 0 && (
                <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 rounded-lg">
                  <h3 className="font-bold text-orange-800 dark:text-orange-300 mb-2">
                    發現 {summary.duplicates} 筆重複條碼
                  </h3>
                  <p className="text-sm text-orange-700 dark:text-orange-400 mb-3">
                    可在下方表格中為每個重複品項單獨選擇處理方式，或使用快速操作：
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAllDuplicateActions('skip')}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        skipCount === duplicateActions.length
                          ? 'bg-orange-200 dark:bg-orange-800 border-orange-400 dark:border-orange-600'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                      }`}
                    >
                      全部略過
                    </button>
                    <button
                      onClick={() => setAllDuplicateActions('overwrite')}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        overwriteCount === duplicateActions.length
                          ? 'bg-orange-200 dark:bg-orange-800 border-orange-400 dark:border-orange-600'
                          : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-orange-100 dark:hover:bg-orange-900/30'
                      }`}
                    >
                      全部覆蓋
                    </button>
                  </div>
                </div>
              )}

              {/* Summary */}
              {summary && (
                <div className="mb-4 flex gap-4 flex-wrap">
                  <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <span className="text-gray-500 dark:text-gray-400 text-sm">總計：</span>
                    <span className="font-bold text-gray-900 dark:text-white ml-1">{summary.total} 筆</span>
                  </div>
                  <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <span className="text-green-600 dark:text-green-400 text-sm">新增：</span>
                    <span className="font-bold text-green-700 dark:text-green-300 ml-1">{summary.valid} 筆</span>
                  </div>
                  {summary.duplicates > 0 && (
                    <div className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <span className="text-orange-600 dark:text-orange-400 text-sm">重複：</span>
                      <span className="font-bold text-orange-700 dark:text-orange-300 ml-1">
                        {summary.duplicates} 筆（{overwriteCount} 覆蓋 / {skipCount} 略過）
                      </span>
                    </div>
                  )}
                  {summary.invalid > 0 && (
                    <div className="px-4 py-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <span className="text-red-600 dark:text-red-400 text-sm">錯誤：</span>
                      <span className="font-bold text-red-700 dark:text-red-300 ml-1">{summary.invalid} 筆</span>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">行</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">條碼</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">商品名稱</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">售價</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">成本</th>
                        <th className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">庫存</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">分類</th>
                        <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">狀態/處理</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {previewData.map((row) => {
                        const rowAction = getRowAction(row.rowNumber)
                        return (
                          <tr
                            key={row.rowNumber}
                            className={`${
                              row.error
                                ? 'bg-red-50 dark:bg-red-900/20'
                                : row.isDuplicate
                                ? 'bg-orange-50 dark:bg-orange-900/20'
                                : row.warning
                                ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                : 'bg-white dark:bg-gray-800'
                            }`}
                          >
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.rowNumber}</td>
                            <td className="px-3 py-2 text-gray-900 dark:text-white font-medium">{row.barcode || '-'}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.name || '-'}</td>
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatCurrency(row.price)}</td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(row.cost)}</td>
                            <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{row.stock}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.category || '-'}</td>
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="text-red-600 dark:text-red-400 text-xs">{row.error}</span>
                              ) : row.isDuplicate ? (
                                <select
                                  value={rowAction || 'skip'}
                                  onChange={(e) => updateDuplicateAction(row.rowNumber, e.target.value as 'skip' | 'overwrite')}
                                  className="text-xs px-2 py-1 rounded border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300"
                                >
                                  <option value="skip">略過（保留原有）</option>
                                  <option value="overwrite">覆蓋（更新）</option>
                                </select>
                              ) : row.warning ? (
                                <span className="text-yellow-600 dark:text-yellow-400 text-xs">{row.warning}</span>
                              ) : (
                                <span className="text-green-600 dark:text-green-400 text-xs">✓ 可匯入</span>
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
                  const newCount = summary?.valid || 0
                  const totalToProcess = newCount + overwriteCount
                  const actionText = overwriteCount > 0
                    ? `確認匯入（${newCount} 新增 + ${overwriteCount} 覆蓋）`
                    : `確認匯入 (${newCount} 筆)`

                  return (
                    <button
                      onClick={handleImport}
                      disabled={loading || totalToProcess === 0}
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
