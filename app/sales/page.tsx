'use client'

import React, { useState, useEffect } from 'react'
import { formatCurrency, formatDate, formatPaymentMethod } from '@/lib/utils'

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
  is_delivered?: boolean
}

type Sale = {
  id: string
  sale_no: string
  customer_code: string | null
  sale_date: string
  source: string
  payment_method: string
  is_paid: boolean
  note: string | null
  total: number
  status: string
  fulfillment_status?: string | null
  created_at: string
  item_count?: number
  total_quantity?: number
  avg_price?: number
  sale_items?: SaleItem[]
  customers?: {
    customer_name: string
  } | null
}

type CustomerGroup = {
  customer_code: string | null
  customer_name: string
  sales: Sale[]
  total_pending: number
  pending_count: number
}

export default function SalesPage() {
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [productKeyword, setProductKeyword] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [showUndeliveredOnly, setShowUndeliveredOnly] = useState(false)
  const [groupByCustomer, setGroupByCustomer] = useState(false)

  const toggleCustomer = (customerKey: string) => {
    const newExpanded = new Set(expandedCustomers)
    if (newExpanded.has(customerKey)) {
      newExpanded.delete(customerKey)
    } else {
      newExpanded.add(customerKey)
    }
    setExpandedCustomers(newExpanded)
  }

  const toggleSale = (id: string) => {
    const newExpanded = new Set(expandedSales)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedSales(newExpanded)
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
        const allSales = data.data || []
        
        if (groupByCustomer) {
          // 按客戶分組
          const groups: { [key: string]: CustomerGroup } = {}

          allSales.forEach((sale: Sale) => {
            // 根据showUndeliveredOnly过滤
            if (showUndeliveredOnly && sale.fulfillment_status === 'completed') {
              return // 只显示未出货的
            }

            const key = sale.customer_code || 'WALK_IN'
            
            if (!groups[key]) {
              groups[key] = {
                customer_code: sale.customer_code,
                customer_name: sale.customer_code 
                  ? (sale.customers?.customer_name || sale.customer_code)
                  : '散客',
                sales: [],
                total_pending: 0,
                pending_count: 0
              }
            }

            groups[key].sales.push(sale)

            // 统计待出货
            if (sale.fulfillment_status !== 'completed') {
              groups[key].total_pending += sale.total
              groups[key].pending_count += 1
            }
          })

          setCustomerGroups(Object.values(groups))
        } else {
          // 不分组，直接显示列表，但根据showUndeliveredOnly过滤
          const filteredSales = showUndeliveredOnly 
            ? allSales.filter((s: Sale) => s.fulfillment_status !== 'completed')
            : allSales
          
          // 用单个组包装所有销售
          setCustomerGroups([{
            customer_code: null,
            customer_name: '所有銷售',
            sales: filteredSales,
            total_pending: 0,
            pending_count: 0
          }])
        }
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSales()
  }, [showUndeliveredOnly, groupByCustomer])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchSales()
  }

  const handleDelete = async (id: string, saleNo: string) => {
    if (!confirm(`確定要刪除銷售單 ${saleNo} 嗎？\n\n此操作將會回補庫存，且無法復原。`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('刪除成功，庫存已回補')
        fetchSales()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  const handleDeliverItem = async (saleItemId: string, itemName: string) => {
    if (!confirm(`確定要出貨「${itemName}」嗎？\n\n此操作將會扣除庫存。`)) {
      return
    }

    setDelivering(saleItemId)
    try {
      const res = await fetch(`/api/sale-items/${saleItemId}/deliver`, {
        method: 'POST',
      })

      const data = await res.json()

      if (data.ok) {
        alert('出貨成功！')
        fetchSales()
      } else {
        alert(`出貨失敗：${data.error}`)
      }
    } catch (err) {
      alert('出貨失敗')
    } finally {
      setDelivering(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">銷售記錄</h1>
        </div>

        {/* Search & Filters */}
        <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋銷售單號或客戶名稱"
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
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByCustomer}
                  onChange={(e) => setGroupByCustomer(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">按客戶分組</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUndeliveredOnly}
                  onChange={(e) => setShowUndeliveredOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">顯示未出貨</span>
              </label>
            </div>
          </form>
        </div>

        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : customerGroups.length === 0 || customerGroups[0]?.sales.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">沒有銷售記錄</div>
          ) : groupByCustomer ? (
            // 分組视图
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {customerGroups.map((group) => {
                const isExpanded = expandedCustomers.has(group.customer_code || 'WALK_IN')
                
                return (
                  <div key={group.customer_code || 'WALK_IN'}>
                    {/* Customer Header */}
                    <div
                      className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => toggleCustomer(group.customer_code || 'WALK_IN')}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {group.customer_name}
                        </span>
                        {group.customer_code && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({group.customer_code})
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-gray-500 dark:text-gray-400">待出貨</div>
                          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {formatCurrency(group.total_pending)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {group.pending_count} 筆訂單
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sales Details */}
                    {isExpanded && (
                      <div className="bg-gray-50 dark:bg-gray-900 px-4 pb-4">
                        <table className="w-full">
                          <thead className="border-b">
                            <tr>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">銷售單號</th>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">付款方式</th>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">銷售日期</th>
                              <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">總金額</th>
                              <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">付款</th>
                              <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">出貨</th>
                              <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {group.sales.map((sale) => (
                              <React.Fragment key={sale.id}>
                                <tr className="hover:bg-white dark:hover:bg-gray-800">
                                  <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSale(sale.id)}>
                                      <span className="text-blue-600">
                                        {expandedSales.has(sale.id) ? '▼' : '▶'}
                                      </span>
                                      {sale.sale_no}
                                      {sale.note && sale.note.trim() !== '' && (
                                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded" title={sale.note}>
                                          備註
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                    {formatPaymentMethod(sale.payment_method)}
                                  </td>
                                  <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                    {formatDate(sale.sale_date)}
                                  </td>
                                  <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {formatCurrency(sale.total)}
                                  </td>
                                  <td className="py-2 text-center text-sm">
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
                                  <td className="py-2 text-center text-sm">
                                    <span
                                      className={`inline-block rounded px-2 py-1 text-xs ${
                                        sale.fulfillment_status === 'completed'
                                          ? 'bg-green-100 text-green-800'
                                          : sale.fulfillment_status === 'partial'
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : sale.fulfillment_status === 'none'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {sale.fulfillment_status === 'completed'
                                        ? '已出貨'
                                        : sale.fulfillment_status === 'partial'
                                        ? '部分出貨'
                                        : sale.fulfillment_status === 'none'
                                        ? '未出貨'
                                        : '舊資料'}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center text-sm">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDelete(sale.id, sale.sale_no)
                                      }}
                                      disabled={deleting === sale.id}
                                      className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-400"
                                    >
                                      {deleting === sale.id ? '刪除中...' : '刪除'}
                                    </button>
                                  </td>
                                </tr>
                                {expandedSales.has(sale.id) && sale.sale_items && (
                                  <tr key={`${sale.id}-items`}>
                                    <td colSpan={7} className="bg-white dark:bg-gray-800 py-2 px-4">
                                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">商品明細</div>
                                      <table className="w-full text-xs">
                                        <thead className="border-b">
                                          <tr>
                                            <th className="pb-1 text-left text-gray-600 dark:text-gray-400">品號</th>
                                            <th className="pb-1 text-left text-gray-600 dark:text-gray-400">商品</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">數量</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">單價</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">小計</th>
                                            <th className="pb-1 text-center text-gray-600 dark:text-gray-400">出貨狀態</th>
                                            <th className="pb-1 text-center text-gray-600 dark:text-gray-400">操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sale.sale_items.map((item) => (
                                            <tr key={item.id}>
                                              <td className="py-1 text-gray-700 dark:text-gray-300">{item.products.item_code}</td>
                                              <td className="py-1 text-gray-700 dark:text-gray-300">{item.snapshot_name}</td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {item.quantity} {item.products.unit}
                                              </td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {formatCurrency(item.price)}
                                              </td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {formatCurrency(item.price * item.quantity)}
                                              </td>
                                              <td className="py-1 text-center">
                                                <span
                                                  className={`inline-block rounded px-2 py-0.5 text-xs ${
                                                    item.is_delivered
                                                      ? 'bg-green-100 text-green-800'
                                                      : 'bg-gray-100 text-gray-800'
                                                  }`}
                                                >
                                                  {item.is_delivered ? '已出貨' : '未出貨'}
                                                </span>
                                              </td>
                                              <td className="py-1 text-center">
                                                {!item.is_delivered && (
                                                  <button
                                                    onClick={() => handleDeliverItem(item.id, item.snapshot_name)}
                                                    disabled={delivering === item.id}
                                                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:bg-gray-400"
                                                  >
                                                    {delivering === item.id ? '處理中...' : '出貨'}
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
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
                )
              })}
            </div>
          ) : (
            // 原始列表视图
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">銷售單號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">客戶</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">付款方式</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">銷售日期</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">商品數</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">總數量</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">平均售價</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">總金額</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">付款</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">出貨</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {customerGroups[0]?.sales.map((sale) => (
                    <React.Fragment key={sale.id}>
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        onClick={() => toggleSale(sale.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {expandedSales.has(sale.id) ? '▼' : '▶'}
                            </span>
                            {sale.sale_no}
                            {sale.note && sale.note.trim() !== '' && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded" title={sale.note}>
                                備註
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {sale.customers?.customer_name || '散客'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {formatPaymentMethod(sale.payment_method)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{formatDate(sale.sale_date)}</td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {sale.item_count || 0} 項
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {sale.total_quantity || 0}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                          {formatCurrency(sale.avg_price || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                              sale.fulfillment_status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : sale.fulfillment_status === 'partial'
                                ? 'bg-yellow-100 text-yellow-800'
                                : sale.fulfillment_status === 'none'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {sale.fulfillment_status === 'completed'
                              ? '已出貨'
                              : sale.fulfillment_status === 'partial'
                              ? '部分出貨'
                              : sale.fulfillment_status === 'none'
                              ? '未出貨'
                              : '舊資料'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleDelete(sale.id, sale.sale_no)}
                            disabled={deleting === sale.id}
                            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            {deleting === sale.id ? '刪除中...' : '刪除'}
                          </button>
                        </td>
                      </tr>
                      {expandedSales.has(sale.id) && sale.sale_items && (
                        <tr key={`${sale.id}-details`}>
                          <td colSpan={11} className="bg-gray-50 dark:bg-gray-900 px-6 py-4">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                              <h4 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">銷售明細</h4>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">品號</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">商品名稱</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">數量</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">售價</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">小計</th>
                                    <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">出貨狀態</th>
                                    <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {sale.sale_items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.products.item_code}</td>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.snapshot_name}</td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {item.quantity}
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.price)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.quantity * item.price)}
                                      </td>
                                      <td className="py-2 text-center">
                                        <span
                                          className={`inline-block rounded px-2 py-1 text-xs ${
                                            item.is_delivered
                                              ? 'bg-green-100 text-green-800'
                                              : 'bg-gray-100 text-gray-800'
                                          }`}
                                        >
                                          {item.is_delivered ? '已出貨' : '未出貨'}
                                        </span>
                                      </td>
                                      <td className="py-2 text-center">
                                        {!item.is_delivered && (
                                          <button
                                            onClick={() => handleDeliverItem(item.id, item.snapshot_name)}
                                            disabled={delivering === item.id}
                                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                                          >
                                            {delivering === item.id ? '處理中...' : '出貨'}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {sale.note && sale.note.trim() !== '' && (
                                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                                  <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-1">備註</div>
                                  <div className="text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2">
                                    {sale.note}
                                  </div>
                                </div>
                              )}
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
