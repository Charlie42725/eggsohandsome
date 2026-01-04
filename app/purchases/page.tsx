'use client'

import { useState, useEffect } from 'react'
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
  purchase_items?: PurchaseItem[]
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

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
      const res = await fetch('/api/purchases')
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">進貨單</h1>
          <Link
            href="/purchases/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增進貨
          </Link>
        </div>

        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : purchases.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有進貨單</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">進貨單號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">廠商代碼</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">進貨日期</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">商品數</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">總數量</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">平均成本</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">總金額</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchases.map((purchase) => (
                    <>
                      <tr
                        key={purchase.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRow(purchase.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {expandedRows.has(purchase.id) ? '▼' : '▶'}
                            </span>
                            {purchase.purchase_no}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{purchase.vendor_code}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDate(purchase.purchase_date)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {purchase.item_count || 0} 項
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {purchase.total_quantity || 0}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(purchase.avg_cost || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
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
                      </tr>
                      {expandedRows.has(purchase.id) && purchase.purchase_items && (
                        <tr key={`${purchase.id}-details`}>
                          <td colSpan={8} className="bg-gray-50 px-6 py-4">
                            <div className="rounded-lg border border-gray-200 bg-white p-4">
                              <h4 className="mb-3 font-semibold text-gray-900">進貨明細</h4>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">品號</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">商品名稱</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">數量</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">成本</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">小計</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {purchase.purchase_items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 text-sm text-gray-900">{item.products.item_code}</td>
                                      <td className="py-2 text-sm text-gray-900">{item.products.name}</td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {item.quantity} {item.products.unit}
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {formatCurrency(item.cost)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900">
                                        {formatCurrency(item.quantity * item.cost)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
