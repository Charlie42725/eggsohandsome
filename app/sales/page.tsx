'use client'

import React, { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'

type SaleItem = {
  id: string
  quantity: number
  price: number
  snapshot_name: string
  product_id: string
  products: {
    item_code: string
    unit: string
  }
}

type Sale = {
  id: string
  sale_no: string
  customer_code: string | null
  sale_date: string
  source: string
  payment_method: string
  is_paid: boolean
  total: number
  status: string
  created_at: string
  item_count?: number
  total_quantity?: number
  avg_price?: number
  sale_items?: SaleItem[]
}

export default function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [productKeyword, setProductKeyword] = useState('')

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const fetchSales = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (productKeyword) params.set('product_keyword', productKeyword)

      const res = await fetch(`/api/sales?${params}`)
      const data = await res.json()
      if (data.ok) {
        setSales(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSales()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchSales()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">銷售記錄</h1>
        </div>

        {/* Search */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋銷售單號或客戶代碼"
                className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 placeholder:text-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
                placeholder="搜尋商品名稱或品號"
                className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 placeholder:text-gray-900"
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

        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : sales.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有銷售記錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">銷售單號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">客戶</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">來源</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">銷售日期</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">商品數</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">總數量</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">平均售價</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">總金額</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">付款</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sales.map((sale) => (
                    <React.Fragment key={sale.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleRow(sale.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {expandedRows.has(sale.id) ? '▼' : '▶'}
                            </span>
                            {sale.sale_no}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{sale.customer_code || '散客'}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {sale.source === 'pos'
                            ? 'POS'
                            : sale.source === 'live'
                            ? '直播'
                            : '手動'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(sale.sale_date)}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {sale.item_count || 0} 項
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {sale.total_quantity || 0}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(sale.avg_price || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs ${
                              sale.is_paid
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {sale.is_paid ? '已收' : '未收'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs ${
                              sale.status === 'confirmed'
                                ? 'bg-green-100 text-green-800'
                                : sale.status === 'cancelled'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {sale.status === 'confirmed'
                              ? '已確認'
                              : sale.status === 'cancelled'
                              ? '已取消'
                              : '草稿'}
                          </span>
                        </td>
                      </tr>
                      {expandedRows.has(sale.id) && sale.sale_items && (
                        <tr key={`${sale.id}-details`}>
                          <td colSpan={10} className="bg-gray-50 px-6 py-4">
                            <div className="rounded-lg border border-gray-200 bg-white p-4">
                              <h4 className="mb-3 font-semibold text-gray-900">銷售明細</h4>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">品號</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">商品名稱</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">數量</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">售價</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">小計</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {sale.sale_items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 text-sm text-gray-900">{item.products.item_code}</td>
                                      <td className="py-2 text-sm text-gray-900">{item.snapshot_name}</td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {item.quantity} {item.products.unit}
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {formatCurrency(item.price)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900">
                                        {formatCurrency(item.quantity * item.price)}
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
