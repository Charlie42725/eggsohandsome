'use client'

import React, { useState, useEffect } from 'react'
import { formatCurrency, formatDate, formatDateTime, formatPaymentMethod } from '@/lib/utils'

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
  delivered_quantity?: number
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

type ProductStats = {
  product_name: string
  item_code: string
  total_quantity: number
  total_sales: number
  customer_purchases: {
    customer_name: string
    customer_code: string | null
    quantity: number
    sales_count: number
  }[]
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
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'live'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 50
  const [productStats, setProductStats] = useState<ProductStats | null>(null)

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
    setCurrentPage(1) // 重置到第一頁
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (productKeyword) params.set('product_keyword', productKeyword)
      if (sourceFilter !== 'all') params.set('source', sourceFilter)

      const res = await fetch(`/api/sales?${params}`)
      const data = await res.json()
      if (data.ok) {
        const allSales = data.data || []
        
        // 計算商品統計（只在有商品關鍵字時）
        if (productKeyword && allSales.length > 0) {
          const stats: { [key: string]: ProductStats } = {}
          const customerMap: { [productKey: string]: { [customerKey: string]: { customer_name: string, customer_code: string | null, quantity: number, sales_count: number } } } = {}
          
          allSales.forEach((sale: Sale) => {
            if (sale.sale_items) {
              sale.sale_items.forEach((item: SaleItem) => {
                const productKey = `${item.product_id}`
                const customerKey = sale.customer_code || 'WALK_IN'
                const customerName = sale.customer_code ? (sale.customers?.customer_name || sale.customer_code) : '散客'
                
                // 初始化商品統計
                if (!stats[productKey]) {
                  stats[productKey] = {
                    product_name: item.snapshot_name,
                    item_code: item.products.item_code,
                    total_quantity: 0,
                    total_sales: 0,
                    customer_purchases: []
                  }
                  customerMap[productKey] = {}
                }
                
                // 累加總數量和總銷售額
                stats[productKey].total_quantity += item.quantity
                stats[productKey].total_sales += item.quantity * item.price
                
                // 累加客戶購買記錄
                if (!customerMap[productKey][customerKey]) {
                  customerMap[productKey][customerKey] = {
                    customer_name: customerName,
                    customer_code: sale.customer_code,
                    quantity: 0,
                    sales_count: 0
                  }
                }
                customerMap[productKey][customerKey].quantity += item.quantity
                customerMap[productKey][customerKey].sales_count += 1
              })
            }
          })
          
          // 轉換客戶購買記錄為陣列並排序
          Object.keys(stats).forEach(productKey => {
            stats[productKey].customer_purchases = Object.values(customerMap[productKey])
              .sort((a, b) => b.quantity - a.quantity)
          })
          
          // 取第一個商品的統計（如果搜尋結果有多個商品，顯示第一個）
          const firstProduct = Object.values(stats)[0]
          setProductStats(firstProduct || null)
        } else {
          setProductStats(null)
        }
        
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
  }, [showUndeliveredOnly, groupByCustomer, sourceFilter])

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

  const handleDeliverItem = async (item: SaleItem) => {
    const deliveredQty = item.delivered_quantity || 0
    const remainingQty = item.quantity - deliveredQty

    if (remainingQty <= 0) {
      alert('此商品已全部出貨')
      return
    }

    const qtyInput = prompt(`出貨數量（剩餘: ${remainingQty} ${item.products.unit}）：`, remainingQty.toString())

    if (qtyInput === null) {
      return // 用戶取消
    }

    const quantity = parseInt(qtyInput)

    if (isNaN(quantity) || quantity <= 0) {
      alert('請輸入有效的數量')
      return
    }

    if (quantity > remainingQty) {
      alert(`出貨數量不能超過剩餘數量（${remainingQty}）`)
      return
    }

    setDelivering(item.id)
    try {
      const res = await fetch('/api/sale-items/batch-deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            sale_item_id: item.id,
            quantity: quantity
          }]
        })
      })

      const data = await res.json()

      if (data.ok) {
        alert(data.message || '出貨成功！')
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

  const handleBatchDeliver = () => {
    if (selectedItemIds.size === 0) {
      alert('請先選擇要出貨的商品')
      return
    }

    // 收集所有選中商品的詳細信息
    const items: SaleItem[] = []
    customerGroups.forEach(group => {
      group.sales.forEach(sale => {
        sale.sale_items?.forEach(item => {
          if (selectedItemIds.has(item.id)) {
            items.push(item)
          }
        })
      })
    })

    // 初始化每個商品的數量為其最大數量
    const newQuantities = new Map<string, number>()
    items.forEach(item => {
      newQuantities.set(item.id, item.quantity)
    })

    setSelectedItemsDetails(items)
    setItemQuantities(newQuantities)
    setShowQuantityModal(true)
  }

  const confirmBatchDeliver = async () => {
    // 計算總出貨數量
    const totalQty = Array.from(selectedItemIds).reduce((sum, id) => {
      return sum + (itemQuantities.get(id) || 0)
    }, 0)

    if (!confirm(`確定要批量出貨 ${selectedItemIds.size} 項商品（共 ${totalQty} 件）嗎？\n\n此操作將會扣除庫存。`)) {
      return
    }

    setBatchDelivering(true)
    try {
      // 構建包含數量的出貨項目陣列
      const items = Array.from(selectedItemIds).map(id => ({
        sale_item_id: id,
        quantity: itemQuantities.get(id) || 0
      }))

      const res = await fetch('/api/sale-items/batch-deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      })

      const data = await res.json()

      if (data.ok) {
        alert(data.message || '批量出貨成功！')
        setSelectedItemIds(new Set())
        setItemQuantities(new Map())
        setShowQuantityModal(false)
        fetchSales()
      } else {
        alert(`批量出貨失敗：${data.error}`)
      }
    } catch (err) {
      alert('批量出貨失敗')
    } finally {
      setBatchDelivering(false)
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
            <div className="space-y-3">
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
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                  銷售通路
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSourceFilter('all')}
                    className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
                      sourceFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    全部
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('pos')}
                    className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
                      sourceFilter === 'pos'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    🏪 店裡
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceFilter('live')}
                    className={`flex-1 rounded px-4 py-2 text-sm font-medium transition-colors ${
                      sourceFilter === 'live'
                        ? 'bg-pink-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    📱 直播
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* 商品統計卡片 */}
        {productStats && (
          <div className="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 shadow-lg border border-blue-200 dark:border-blue-800">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                📊 商品銷售統計
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {productStats.item_code} - {productStats.product_name}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">總銷售數量</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {productStats.total_quantity}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">總銷售額</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(productStats.total_sales)}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                購買客戶明細（共 {productStats.customer_purchases.length} 位）
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {productStats.customer_purchases.map((customer, index) => (
                  <div 
                    key={`${customer.customer_code || 'WALK_IN'}-${index}`}
                    className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {customer.customer_name}
                      </div>
                      {customer.customer_code && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {customer.customer_code}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {customer.quantity} 個
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {customer.sales_count} 筆訂單
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
                                    {formatDateTime(sale.created_at)}
                                  </td>
                                  <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {formatCurrency(sale.total)}
                                  </td>
                                  <td className="py-2 text-center text-sm">
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs ${
                                        sale.is_paid
                                          ? 'text-green-600 dark:text-green-400'
                                          : 'text-gray-500 dark:text-gray-400'
                                      }`}
                                    >
                                      {sale.is_paid ? '✓ 已收' : '○ 未收'}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center text-sm">
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs ${
                                        sale.fulfillment_status === 'completed'
                                          ? 'text-blue-600 dark:text-blue-400'
                                          : sale.fulfillment_status === 'partial'
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : sale.fulfillment_status === 'none'
                                          ? 'text-gray-500 dark:text-gray-400'
                                          : 'text-gray-400'
                                      }`}
                                    >
                                      {sale.fulfillment_status === 'completed'
                                        ? '🚚 已出貨'
                                        : sale.fulfillment_status === 'partial'
                                        ? '⚡ 部分出貨'
                                        : sale.fulfillment_status === 'none'
                                        ? '• 未出貨'
                                        : '? 舊資料'}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center text-sm">
                                    <div className="relative inline-block">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (confirm(`確定要作廢銷售單 ${sale.sale_no} 嗎？\n\n此操作將會回補庫存，且無法復原。`)) {
                                            handleDelete(sale.id, sale.sale_no)
                                          }
                                        }}
                                        disabled={deleting === sale.id}
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-lg font-bold disabled:opacity-50"
                                        title="更多操作"
                                      >
                                        {deleting === sale.id ? '...' : '⋯'}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                                {expandedSales.has(sale.id) && sale.sale_items && (
                                  <tr key={`${sale.id}-items`}>
                                    <td colSpan={7} className="bg-white dark:bg-gray-800 py-2 px-4">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">商品明細</div>
                                      </div>
                                      <table className="w-full text-xs">
                                        <thead className="border-b">
                                          <tr>
                                            <th className="pb-1 text-left text-gray-600 dark:text-gray-400">品號</th>
                                            <th className="pb-1 text-left text-gray-600 dark:text-gray-400">商品名稱</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">訂單數量</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">已出貨</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">單價</th>
                                            <th className="pb-1 text-right text-gray-600 dark:text-gray-400">小計</th>
                                            <th className="pb-1 text-center text-gray-600 dark:text-gray-400">操作</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sale.sale_items.map((item) => {
                                            const deliveredQty = item.delivered_quantity || 0
                                            const remainingQty = item.quantity - deliveredQty
                                            return (
                                            <tr key={item.id}>
                                              <td className="py-1 text-gray-700 dark:text-gray-300">{item.products.item_code}</td>
                                              <td className="py-1 text-gray-700 dark:text-gray-300">{item.snapshot_name}</td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {item.quantity} {item.products.unit}
                                              </td>
                                              <td className="py-1 text-right">
                                                <span
                                                  className={`font-medium ${
                                                    item.is_delivered
                                                      ? 'text-green-600 dark:text-green-400'
                                                      : deliveredQty > 0
                                                      ? 'text-yellow-600 dark:text-yellow-400'
                                                      : 'text-gray-600 dark:text-gray-400'
                                                  }`}
                                                >
                                                  {deliveredQty} / {item.quantity}
                                                </span>
                                              </td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {formatCurrency(item.price)}
                                              </td>
                                              <td className="py-1 text-right text-gray-700 dark:text-gray-300">
                                                {formatCurrency(item.price * item.quantity)}
                                              </td>
                                              <td className="py-1 text-center">
                                                {!item.is_delivered && (
                                                  <button
                                                    onClick={() => handleDeliverItem(item)}
                                                    disabled={delivering === item.id}
                                                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:bg-gray-400"
                                                  >
                                                    {delivering === item.id ? '處理中...' : '出貨'}
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          )})}
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
            <>
              {/* 分頁資訊 */}
              {customerGroups[0]?.sales && customerGroups[0].sales.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    共 {customerGroups[0].sales.length} 筆記錄
                    {customerGroups[0].sales.length > itemsPerPage && (
                      <span> · 顯示第 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, customerGroups[0].sales.length)} 筆</span>
                    )}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">銷售單號</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">客戶</th>
                      <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">總金額</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">商品摘要</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">付款方式</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">銷售日期</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">付款</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">出貨</th>
                      <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(() => {
                      const allSales = customerGroups[0]?.sales || []
                      const startIndex = (currentPage - 1) * itemsPerPage
                      const endIndex = startIndex + itemsPerPage
                      const paginatedSales = allSales.slice(startIndex, endIndex)
                      
                      return paginatedSales.map((sale) => (
                    <React.Fragment key={sale.id}>
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        onClick={() => toggleSale(sale.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs">
                              {expandedSales.has(sale.id) ? '▾' : '▸'}
                            </span>
                            {sale.sale_no}
                            {sale.note && sale.note.trim() !== '' && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded" title={sale.note}>
                                備註
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {sale.customers?.customer_name || '散客'}
                        </td>
                        <td className={`px-6 py-4 text-right text-lg font-semibold ${
                          sale.total > 0 
                            ? 'text-gray-900 dark:text-gray-100' 
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {formatCurrency(sale.total)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {sale.item_count || 0} 項 / {sale.total_quantity || 0} 件
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {formatPaymentMethod(sale.payment_method)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{formatDateTime(sale.created_at)}</td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              sale.is_paid
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {sale.is_paid ? '✓ 已收' : '○ 未收'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-flex items-center gap-1 text-xs ${
                              sale.fulfillment_status === 'completed'
                                ? 'text-blue-600 dark:text-blue-400'
                                : sale.fulfillment_status === 'partial'
                                ? 'text-amber-600 dark:text-amber-400'
                                : sale.fulfillment_status === 'none'
                                ? 'text-gray-500 dark:text-gray-400'
                                : 'text-gray-400'
                            }`}
                          >
                            {sale.fulfillment_status === 'completed'
                              ? '🚚 已出貨'
                              : sale.fulfillment_status === 'partial'
                              ? '⚡ 部分出貨'
                              : sale.fulfillment_status === 'none'
                              ? '• 未出貨'
                              : '? 舊資料'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (confirm(`確定要作廢銷售單 ${sale.sale_no} 嗎？\n\n此操作將會回補庫存，且無法復原。`)) {
                                handleDelete(sale.id, sale.sale_no)
                              }
                            }}
                            disabled={deleting === sale.id}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-lg font-bold disabled:opacity-50"
                            title="更多操作"
                          >
                            {deleting === sale.id ? '...' : '⋯'}
                          </button>
                        </td>
                      </tr>
                      {expandedSales.has(sale.id) && sale.sale_items && (
                        <tr key={`${sale.id}-details`}>
                          <td colSpan={9} className="bg-gray-50 dark:bg-gray-900 px-6 py-4">
                            <div className="ml-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-gray-900 dark:text-gray-100">銷售明細</h4>
                              </div>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">品號</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">商品名稱</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">訂單數量</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">已出貨</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">售價</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">小計</th>
                                    <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {sale.sale_items.map((item) => {
                                    const deliveredQty = item.delivered_quantity || 0
                                    const remainingQty = item.quantity - deliveredQty
                                    return (
                                    <tr key={item.id}>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.products.item_code}</td>
                                      <td className="py-2 text-sm text-gray-900 dark:text-gray-100">{item.snapshot_name}</td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {item.quantity} {item.products.unit}
                                      </td>
                                      <td className="py-2 text-right text-sm">
                                        <span
                                          className={`font-medium ${
                                            item.is_delivered
                                              ? 'text-green-600 dark:text-green-400'
                                              : deliveredQty > 0
                                              ? 'text-yellow-600 dark:text-yellow-400'
                                              : 'text-gray-600 dark:text-gray-400'
                                          }`}
                                        >
                                          {deliveredQty} / {item.quantity}
                                        </span>
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.price)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {formatCurrency(item.quantity * item.price)}
                                      </td>
                                      <td className="py-2 text-center">
                                        {!item.is_delivered && (
                                          <button
                                            onClick={() => handleDeliverItem(item)}
                                            disabled={delivering === item.id}
                                            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:bg-gray-400"
                                          >
                                            {delivering === item.id ? '處理中...' : '出貨'}
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )})}
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

              {/* 分頁導航 */}
              {(() => {
                const allSales = customerGroups[0]?.sales || []
                const totalPages = Math.ceil(allSales.length / itemsPerPage)
              
              if (totalPages <= 1) return null

              return (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一頁
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                      // 顯示前 3 頁、當前頁周圍、最後 3 頁
                      const showPage = page <= 3 || page > totalPages - 3 || Math.abs(page - currentPage) <= 1
                      const showEllipsis = (page === 4 && currentPage > 5) || (page === totalPages - 3 && currentPage < totalPages - 4)
                      
                      if (showEllipsis) {
                        return <span key={page} className="px-2 text-gray-500">...</span>
                      }
                      
                      if (!showPage) return null
                      
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[2.5rem] rounded px-3 py-2 text-sm font-medium ${
                            currentPage === page
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    })}
                  </div>
                  
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="rounded bg-gray-200 dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一頁
                  </button>
                </div>
              )
            })()}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
