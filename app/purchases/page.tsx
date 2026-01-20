'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'

type PurchaseItem = {
  id: string
  quantity: number
  cost: number
  product_id: string
  received_quantity: number
  is_received: boolean
  products: {
    name: string
    item_code: string
    unit: string
  }
}

type Purchase = {
  id: string
  purchase_no: string
  vendor_code: string
  purchase_date: string
  total: number
  status: string
  is_paid: boolean
  receiving_status: string
  created_at: string
  item_count?: number
  total_quantity?: number
  avg_cost?: number
  vendors?: {
    vendor_name: string
  }
  purchase_items?: PurchaseItem[]
}

type UserRole = 'admin' | 'staff'

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [productKeyword, setProductKeyword] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50

  // Sorting state
  type SortField = 'purchase_no' | 'vendor_name' | 'total' | 'purchase_date' | 'status' | 'is_paid' | 'receiving_status'
  const [sortField, setSortField] = useState<SortField>('purchase_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Batch receiving state
  const [selectedPurchases, setSelectedPurchases] = useState<Set<string>>(new Set())
  const [batchReceiving, setBatchReceiving] = useState(false)

  useEffect(() => {
    // Fetch current user role
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setUserRole(data.data.role)
        }
      })
      .catch(() => {
        // Ignore error
      })
  }, [])

  const isAdmin = userRole === 'admin'

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const fetchPurchases = async () => {
    setLoading(true)
    setCurrentPage(1) // 重置到第一頁
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (productKeyword) params.set('product_keyword', productKeyword)

      const res = await fetch(`/api/purchases?${params}`)
      const data = await res.json()
      if (data.ok) {
        // 计算每个进货单的收货状态
        const purchasesWithStatus = (data.data || []).map((purchase: Purchase) => {
          const items = purchase.purchase_items || []
          let receiving_status = 'none'

          if (items.length > 0) {
            // 安全地检查字段是否存在
            const allReceived = items.every(item => item.is_received === true)
            const anyReceived = items.some(item => (item.received_quantity || 0) > 0)

            if (allReceived) {
              receiving_status = 'completed'
            } else if (anyReceived) {
              receiving_status = 'partial'
            }
          }

          return {
            ...purchase,
            receiving_status
          }
        })

        setPurchases(purchasesWithStatus)
      }
    } catch (err) {
      console.error('Failed to fetch purchases:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPurchases()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchPurchases()
  }

  const handleDeletePurchase = async (id: string, purchaseNo: string) => {
    if (!confirm(`確定要刪除進貨單 ${purchaseNo} 嗎？\n\n此操作將會回補庫存，且無法復原。`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('刪除成功，庫存已回補')
        fetchPurchases()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  const handleDeleteItem = async (itemId: string, productName: string, purchaseId: string) => {
    if (!confirm(`確定要刪除進貨明細「${productName}」嗎？\n\n此操作將會回補該商品庫存並重新計算進貨總額。`)) {
      return
    }

    setDeleting(itemId)
    try {
      const res = await fetch(`/api/purchase-items/${itemId}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('刪除成功，庫存已回補')
        fetchPurchases()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  const handleReceiveItem = async (itemId: string, productName: string, remainingQty: number) => {
    const quantityStr = prompt(`收貨數量（剩餘: ${remainingQty}）：`, remainingQty.toString())
    if (!quantityStr) return

    const quantity = parseInt(quantityStr, 10)
    if (isNaN(quantity) || quantity <= 0) {
      alert('請輸入有效的數量')
      return
    }

    if (quantity > remainingQty) {
      alert(`收貨數量不能超過剩餘數量（${remainingQty}）`)
      return
    }

    setDeleting(itemId)
    try {
      const res = await fetch(`/api/purchase-items/${itemId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })

      const data = await res.json()

      if (data.ok) {
        alert(data.message || '收貨成功，庫存已增加')
        fetchPurchases()
      } else {
        alert(`收貨失敗：${data.error}`)
      }
    } catch (err) {
      alert('收貨失敗')
    } finally {
      setDeleting(null)
    }
  }

  // Sorting handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  // Sort purchases
  const sortedPurchases = [...purchases].sort((a, b) => {
    let aValue: any
    let bValue: any

    switch (sortField) {
      case 'purchase_no':
        aValue = a.purchase_no
        bValue = b.purchase_no
        break
      case 'vendor_name':
        aValue = a.vendors?.vendor_name || a.vendor_code
        bValue = b.vendors?.vendor_name || b.vendor_code
        break
      case 'total':
        aValue = a.total
        bValue = b.total
        break
      case 'purchase_date':
        aValue = new Date(a.purchase_date).getTime()
        bValue = new Date(b.purchase_date).getTime()
        break
      case 'status':
        aValue = a.status
        bValue = b.status
        break
      case 'is_paid':
        aValue = a.is_paid ? 1 : 0
        bValue = b.is_paid ? 1 : 0
        break
      case 'receiving_status':
        const statusOrder = { completed: 2, partial: 1, none: 0 }
        aValue = statusOrder[a.receiving_status as keyof typeof statusOrder] || 0
        bValue = statusOrder[b.receiving_status as keyof typeof statusOrder] || 0
        break
      default:
        return 0
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1
    return 0
  })

  // Check if a purchase can be selected for batch receiving
  const canSelectForReceiving = (purchase: Purchase) => {
    return purchase.status === 'approved' && purchase.receiving_status !== 'completed'
  }

  // Get selectable purchases for current page
  const getSelectablePurchases = () => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return sortedPurchases.slice(startIndex, endIndex).filter(canSelectForReceiving)
  }

  // Toggle single purchase selection
  const togglePurchaseSelection = (id: string) => {
    const newSelected = new Set(selectedPurchases)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedPurchases(newSelected)
  }

  // Toggle all selectable purchases on current page
  const toggleSelectAll = () => {
    const selectable = getSelectablePurchases()
    const allSelected = selectable.every(p => selectedPurchases.has(p.id))

    const newSelected = new Set(selectedPurchases)
    if (allSelected) {
      // Deselect all
      selectable.forEach(p => newSelected.delete(p.id))
    } else {
      // Select all
      selectable.forEach(p => newSelected.add(p.id))
    }
    setSelectedPurchases(newSelected)
  }

  // Batch receive handler
  const handleBatchReceive = async () => {
    if (selectedPurchases.size === 0) {
      alert('請先選擇要收貨的進貨單')
      return
    }

    if (!confirm(`確定要批量收貨 ${selectedPurchases.size} 筆進貨單嗎？\n\n這將會收取所有選中進貨單中尚未收貨的商品。`)) {
      return
    }

    setBatchReceiving(true)
    try {
      const res = await fetch('/api/purchases/batch-receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_ids: Array.from(selectedPurchases) }),
      })

      const data = await res.json()

      if (data.ok) {
        alert(data.message || '批量收貨完成')
        setSelectedPurchases(new Set())
        fetchPurchases()
      } else {
        alert(`批量收貨失敗：${data.error}`)
      }
    } catch (err) {
      alert('批量收貨失敗')
    } finally {
      setBatchReceiving(false)
    }
  }

  // Sort indicator component
  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300 dark:text-gray-600">⇅</span>
    return <span className="ml-1">{sortOrder === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">進貨單</h1>
            {!isAdmin && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">員工模式：僅顯示數量資訊</p>
            )}
          </div>
          {isAdmin ? (
            <Link
              href="/purchases/new"
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              + 新增進貨
            </Link>
          ) : (
            <Link
              href="/purchases/staff"
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              + 進貨登記
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋進貨單號或廠商代碼"
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700 placeholder:text-gray-900 dark:placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
                placeholder="搜尋商品名稱或品號"
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700 placeholder:text-gray-900 dark:placeholder:text-gray-400"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
              >
                搜尋
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : purchases.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">沒有進貨單</div>
          ) : (
            <>
              {/* 分頁資訊 */}
              {purchases.length > 0 && (
                <div className="px-6 pt-6 pb-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    共 {purchases.length} 筆記錄
                    {purchases.length > itemsPerPage && (
                      <span> · 顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, purchases.length)} 筆</span>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {/* Checkbox column */}
                      <th className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={getSelectablePurchases().length > 0 && getSelectablePurchases().every(p => selectedPurchases.has(p.id))}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          title="全選可收貨訂單"
                        />
                      </th>
                      <th
                        className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('purchase_no')}
                      >
                        進貨單號<SortIndicator field="purchase_no" />
                      </th>
                      <th
                        className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('vendor_name')}
                      >
                        廠商名稱<SortIndicator field="vendor_name" />
                      </th>
                      {isAdmin && (
                        <th
                          className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('total')}
                        >
                          總金額<SortIndicator field="total" />
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">商品摘要</th>
                      <th
                        className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('purchase_date')}
                      >
                        進貨日期<SortIndicator field="purchase_date" />
                      </th>
                      <th
                        className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('status')}
                      >
                        審核<SortIndicator field="status" />
                      </th>
                      <th
                        className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('is_paid')}
                      >
                        付款<SortIndicator field="is_paid" />
                      </th>
                      <th
                        className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => handleSort('receiving_status')}
                      >
                        收貨<SortIndicator field="receiving_status" />
                      </th>
                      {isAdmin && (
                        <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">操作</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(() => {
                      const startIndex = (currentPage - 1) * itemsPerPage
                      const endIndex = startIndex + itemsPerPage
                      const paginatedPurchases = sortedPurchases.slice(startIndex, endIndex)

                      return paginatedPurchases.map((purchase) => (
                        <React.Fragment key={purchase.id}>
                          <tr
                            className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                            onClick={() => toggleRow(purchase.id)}
                          >
                            {/* Checkbox cell */}
                            <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                              {canSelectForReceiving(purchase) ? (
                                <input
                                  type="checkbox"
                                  checked={selectedPurchases.has(purchase.id)}
                                  onChange={() => togglePurchaseSelection(purchase.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400 text-xs">
                                  {expandedRows.has(purchase.id) ? '▾' : '▸'}
                                </span>
                                {purchase.purchase_no}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{purchase.vendors?.vendor_name || purchase.vendor_code}</td>
                            {isAdmin && (
                              <td className={`px-6 py-4 text-right text-lg font-semibold ${purchase.total > 0
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-400 dark:text-gray-500'
                                }`}>
                                {formatCurrency(purchase.total)}
                              </td>
                            )}
                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                              {purchase.item_count || 0} 項 / {purchase.total_quantity || 0} 件
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                              {formatDate(purchase.purchase_date)}
                            </td>
                            <td className="px-6 py-4 text-center text-sm">
                              <span
                                className={`inline-flex items-center gap-1 text-xs ${purchase.status === 'approved'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-orange-500 dark:text-orange-400'
                                  }`}
                              >
                                {purchase.status === 'approved' ? '✓ 已審核' : '○ 待審核'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-sm">
                              <span
                                className={`inline-flex items-center gap-1 text-xs ${purchase.is_paid
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-gray-500 dark:text-gray-400'
                                  }`}
                              >
                                {purchase.is_paid ? '✓ 已付' : '○ 未付'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-sm">
                              <span
                                className={`inline-flex items-center gap-1 text-xs ${purchase.receiving_status === 'completed'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : purchase.receiving_status === 'partial'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-500 dark:text-gray-400'
                                  }`}
                              >
                                {purchase.receiving_status === 'completed'
                                  ? '📦 已收貨'
                                  : purchase.receiving_status === 'partial'
                                    ? '⚡ 部分收貨'
                                    : '• 未收貨'}
                              </span>
                            </td>
                            {isAdmin && (
                              <td className="px-6 py-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
                                <div className="flex gap-2 justify-center">
                                  {purchase.status === 'pending' && (
                                    <Link
                                      href={`/purchases/${purchase.id}/review`}
                                      className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                                    >
                                      審核
                                    </Link>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (confirm(`確定要刪除進貨單 ${purchase.purchase_no} 嗎？此操作無法復原。`)) {
                                        handleDeletePurchase(purchase.id, purchase.purchase_no)
                                      }
                                    }}
                                    disabled={deleting === purchase.id}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-lg font-bold disabled:text-gray-300 disabled:cursor-not-allowed"
                                    title="更多操作"
                                  >
                                    {deleting === purchase.id ? '...' : '⋯'}
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                          {expandedRows.has(purchase.id) && purchase.purchase_items && (
                            <tr key={`${purchase.id}-details`}>
                              <td colSpan={isAdmin ? 10 : 8} className="bg-gray-50 dark:bg-gray-900 px-6 py-4">
                                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                                  <h4 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">進貨明細</h4>
                                  <table className="w-full">
                                    <thead className="border-b">
                                      <tr>
                                        <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">品號</th>
                                        <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">商品名稱</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">進貨數量</th>
                                        <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">已收貨</th>
                                        {isAdmin && (
                                          <>
                                            <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">成本</th>
                                            <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">小計</th>
                                          </>
                                        )}
                                        {(isAdmin || purchase.status === 'approved') && (
                                          <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-gray-700">
                                      {purchase.purchase_items.map((item) => {
                                        const remainingQty = item.quantity - (item.received_quantity || 0)
                                        return (
                                          <tr key={item.id}>
                                            <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                              <Link
                                                href={`/products/${item.product_id}/edit`}
                                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                {item.products.item_code}
                                              </Link>
                                            </td>
                                            <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                              <Link
                                                href={`/products/${item.product_id}/edit`}
                                                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                {item.products.name}
                                              </Link>
                                            </td>
                                            <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                              {item.quantity} {item.products.unit}
                                            </td>
                                            <td className="py-2 text-right text-sm">
                                              <span
                                                className={`font-medium ${item.is_received
                                                  ? 'text-green-600 dark:text-green-400'
                                                  : item.received_quantity > 0
                                                    ? 'text-yellow-600 dark:text-yellow-400'
                                                    : 'text-gray-600 dark:text-gray-400'
                                                  }`}
                                              >
                                                {item.received_quantity || 0} / {item.quantity}
                                              </span>
                                            </td>
                                            {isAdmin && (
                                              <>
                                                <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                                  {formatCurrency(item.cost)}
                                                </td>
                                                <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                  {formatCurrency(item.quantity * item.cost)}
                                                </td>
                                              </>
                                            )}
                                            {(isAdmin || purchase.status === 'approved') && (
                                              <td className="py-2 text-center text-sm">
                                                <div className="flex gap-2 justify-center">
                                                  {!item.is_received && (
                                                    <button
                                                      onClick={() => handleReceiveItem(item.id, item.products.name, remainingQty)}
                                                      disabled={deleting === item.id}
                                                      className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                                    >
                                                      {deleting === item.id ? '收貨中' : '收貨'}
                                                    </button>
                                                  )}
                                                  {isAdmin && (
                                                    <button
                                                      onClick={() => {
                                                        if (confirm(`確定要刪除 ${item.products.name} 嗎？此操作無法復原。`)) {
                                                          handleDeleteItem(item.id, item.products.name, purchase.id)
                                                        }
                                                      }}
                                                      disabled={deleting === item.id}
                                                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-base font-bold disabled:text-gray-300 disabled:cursor-not-allowed"
                                                      title="刪除項目"
                                                    >
                                                      {deleting === item.id ? '...' : '⋯'}
                                                    </button>
                                                  )}
                                                </div>
                                              </td>
                                            )}
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {purchases.length > itemsPerPage && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一頁
                  </button>

                  {(() => {
                    const totalPages = Math.ceil(purchases.length / itemsPerPage)
                    const pages: (number | string)[] = []

                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i)
                    } else {
                      if (currentPage <= 4) {
                        for (let i = 1; i <= 5; i++) pages.push(i)
                        pages.push('...')
                        pages.push(totalPages)
                      } else if (currentPage >= totalPages - 3) {
                        pages.push(1)
                        pages.push('...')
                        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i)
                      } else {
                        pages.push(1)
                        pages.push('...')
                        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
                        pages.push('...')
                        pages.push(totalPages)
                      }
                    }

                    return pages.map((page, idx) =>
                      typeof page === 'number' ? (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 text-sm rounded ${currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                          {page}
                        </button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-500">
                          {page}
                        </span>
                      )
                    )
                  })()}

                  <button
                    onClick={() => setCurrentPage(p => Math.min(Math.ceil(purchases.length / itemsPerPage), p + 1))}
                    disabled={currentPage >= Math.ceil(purchases.length / itemsPerPage)}
                    className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一頁
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Floating action bar for batch receiving */}
        {selectedPurchases.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg px-6 py-4 z-50">
            <div className="mx-auto max-w-7xl flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                已選擇 <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedPurchases.size}</span> 筆進貨單
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedPurchases(new Set())}
                  className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  取消選擇
                </button>
                <button
                  onClick={handleBatchReceive}
                  disabled={batchReceiving}
                  className="rounded bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {batchReceiving ? '處理中...' : '📦 一鍵收貨'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
