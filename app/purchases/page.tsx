'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/utils'

type PurchaseItem = {
  id: string
  quantity: number
  cost: number
  product_id: string
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
  created_at: string
  item_count?: number
  total_quantity?: number
  avg_cost?: number
  vendors?: {
    vendor_name: string
  }
  purchase_items?: PurchaseItem[]
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [productKeyword, setProductKeyword] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

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
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (productKeyword) params.set('product_keyword', productKeyword)

      const res = await fetch(`/api/purchases?${params}`)
      const data = await res.json()
      if (data.ok) {
        setPurchases(data.data || [])
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">進貨單</h1>
          <Link
            href="/purchases/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增進貨
          </Link>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">進貨單號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">廠商名稱</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">進貨日期</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">商品數</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">總數量</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">平均成本</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">總金額</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">狀態</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {purchases.map((purchase) => (
                    <React.Fragment key={purchase.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRow(purchase.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {expandedRows.has(purchase.id) ? '▼' : '▶'}
                            </span>
                            {purchase.purchase_no}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{purchase.vendors?.vendor_name || purchase.vendor_code}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(purchase.purchase_date)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {purchase.item_count || 0} 項
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {purchase.total_quantity || 0}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {formatCurrency(purchase.avg_cost || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(purchase.total)}
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs ${
                              purchase.status === 'confirmed'
                                ? 'bg-green-100 text-green-800'
                                : purchase.status === 'cancelled'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {purchase.status === 'confirmed'
                              ? '已確認'
                              : purchase.status === 'cancelled'
                              ? '已取消'
                              : '草稿'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDeletePurchase(purchase.id, purchase.purchase_no)}
                            disabled={deleting === purchase.id}
                            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {deleting === purchase.id ? '刪除中...' : '刪除'}
                          </button>
                        </td>
                      </tr>
                      {expandedRows.has(purchase.id) && purchase.purchase_items && (
                        <tr key={`${purchase.id}-details`}>
                          <td colSpan={9} className="bg-gray-50 dark:bg-gray-900 px-6 py-4">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-4">
                              <h4 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">進貨明細</h4>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">品號</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">商品名稱</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">數量</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">成本</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">小計</th>
                                    <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {purchase.purchase_items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.products.item_code}</td>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.products.name}</td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {item.quantity}
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.cost)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.quantity * item.cost)}
                                      </td>
                                      <td className="py-2 text-center text-sm">
                                        <button
                                          onClick={() => handleDeleteItem(item.id, item.products.name, purchase.id)}
                                          disabled={deleting === item.id}
                                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                          {deleting === item.id ? '刪除中' : '刪除'}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
