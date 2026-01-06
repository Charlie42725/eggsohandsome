'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

type DashboardStats = {
  todaySales: number
  todayOrders: number
  totalCost: number
  totalExpenses: number
  grossProfit: number
  netProfit: number
  totalAR: number
  totalAP: number
  overdueAR: number
  overdueAP: number
  costBreakdown?: Array<{
    product_name: string
    cost: number
    quantity: number
    total_cost: number
  }>
}

type RecentSale = {
  id: string
  sale_no: string
  total: number
  customer_code: string | null
  created_at: string
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayOrders: 0,
    totalCost: 0,
    totalExpenses: 0,
    grossProfit: 0,
    netProfit: 0,
    totalAR: 0,
    totalAP: 0,
    overdueAR: 0,
    overdueAP: 0,
  })
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    fetchDashboardData()
  }, [dateFrom, dateTo])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch sales within date range
      const salesRes = await fetch(`/api/sales?date_from=${dateFrom}&date_to=${dateTo}`)
      const salesData = await salesRes.json()
      const salesInRange = salesData.ok ? salesData.data : []
      const totalSales = salesInRange
        .filter((s: any) => s.status === 'confirmed')
        .reduce((sum: number, s: any) => sum + s.total, 0)

      // Calculate total cost from sale items and collect breakdown
      const costBreakdownMap = new Map<string, { cost: number; quantity: number; name: string }>()

      const totalCost = salesInRange
        .filter((s: any) => s.status === 'confirmed')
        .reduce((sum: number, s: any) => {
          const saleCost = (s.sale_items || []).reduce(
            (itemSum: number, item: any) => {
              const itemCost = (item.cost || 0) * item.quantity

              // Collect cost breakdown
              const key = item.product_id
              if (costBreakdownMap.has(key)) {
                const existing = costBreakdownMap.get(key)!
                existing.quantity += item.quantity
              } else {
                costBreakdownMap.set(key, {
                  cost: item.cost || 0,
                  quantity: item.quantity,
                  name: item.snapshot_name || '未知商品'
                })
              }

              return itemSum + itemCost
            },
            0
          )
          return sum + saleCost
        }, 0)

      const costBreakdown = Array.from(costBreakdownMap.values()).map(item => ({
        product_name: item.name,
        cost: item.cost,
        quantity: item.quantity,
        total_cost: item.cost * item.quantity
      }))

      // Fetch expenses within date range
      const expensesRes = await fetch(`/api/expenses?date_from=${dateFrom}&date_to=${dateTo}`)
      const expensesData = await expensesRes.json()
      const expensesInRange = expensesData.ok ? expensesData.data : []
      const totalExpenses = expensesInRange.reduce(
        (sum: number, e: any) => sum + e.amount,
        0
      )

      // Calculate profits
      const grossProfit = totalSales - totalCost
      const netProfit = grossProfit - totalExpenses

      // Fetch AR
      const arRes = await fetch('/api/ar')
      const arData = await arRes.json()
      const arAccounts = arData.ok ? arData.data : []
      const totalAR = arAccounts
        .filter((a: any) => a.status !== 'paid')
        .reduce((sum: number, a: any) => sum + a.balance, 0)
      const overdueAR = arAccounts
        .filter(
          (a: any) =>
            a.status !== 'paid' && new Date(a.due_date) < new Date()
        )
        .reduce((sum: number, a: any) => sum + a.balance, 0)

      // Fetch AP
      const apRes = await fetch('/api/ap')
      const apData = await apRes.json()
      const apAccounts = apData.ok ? apData.data : []
      const totalAP = apAccounts
        .filter((a: any) => a.status !== 'paid')
        .reduce((sum: number, a: any) => sum + a.balance, 0)
      const overdueAP = apAccounts
        .filter(
          (a: any) =>
            a.status !== 'paid' && new Date(a.due_date) < new Date()
        )
        .reduce((sum: number, a: any) => sum + a.balance, 0)

      setStats({
        todaySales: totalSales,
        todayOrders: salesInRange.length,
        totalCost,
        totalExpenses,
        grossProfit,
        netProfit,
        totalAR,
        totalAP,
        overdueAR,
        overdueAP,
        costBreakdown,
      })

      // Fetch recent sales
      const recentSalesRes = await fetch('/api/sales')
      const recentSalesData = await recentSalesRes.json()
      setRecentSales(
        recentSalesData.ok ? recentSalesData.data.slice(0, 10) : []
      )
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-xl text-gray-900">載入中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">營收報表</h1>

        {/* Date Filter */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                起始日期
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                結束日期
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* KPI Cards - Row 1: Revenue & Profit */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">期間營收</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {formatCurrency(stats.todaySales)}
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {stats.todayOrders} 筆訂單
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">期間成本</div>
            <div className="mt-2 text-3xl font-bold text-orange-600">
              {formatCurrency(stats.totalCost)}
            </div>
            <div className="mt-1 text-sm text-gray-900">
              毛利率: {stats.todaySales > 0 ? ((stats.grossProfit / stats.todaySales) * 100).toFixed(1) : 0}%
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">期間支出</div>
            <div className="mt-2 text-3xl font-bold text-red-600">
              {formatCurrency(stats.totalExpenses)}
            </div>
            <div className="mt-1 text-sm text-gray-900">
              會計支出
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">期間淨利</div>
            <div className={`mt-2 text-3xl font-bold ${stats.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.netProfit)}
            </div>
            <div className="mt-1 text-sm text-gray-900">
              毛利: {formatCurrency(stats.grossProfit)}
            </div>
          </div>
        </div>

        {/* KPI Cards - Row 2: AR/AP */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">應收帳款</div>
            <div className="mt-2 text-3xl font-bold text-blue-600">
              {formatCurrency(stats.totalAR)}
            </div>
            {stats.overdueAR > 0 && (
              <div className="mt-1 text-sm text-red-600">
                逾期: {formatCurrency(stats.overdueAR)}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">應付帳款</div>
            <div className="mt-2 text-3xl font-bold text-orange-600">
              {formatCurrency(stats.totalAP)}
            </div>
            {stats.overdueAP > 0 && (
              <div className="mt-1 text-sm text-red-600">
                逾期: {formatCurrency(stats.overdueAP)}
              </div>
            )}
          </div>
        </div>

        {/* Cost Breakdown */}
        {stats.costBreakdown && stats.costBreakdown.length > 0 && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold text-gray-900">期間成本明細</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">商品名稱</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">單位成本</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">銷售數量</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">總成本</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stats.costBreakdown.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{item.product_name}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {formatCurrency(item.cost)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {formatCurrency(item.total_cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      總計:
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(stats.totalCost)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Recent Sales */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">最近銷售</h2>
            <Link
              href="/sales"
              className="text-sm text-blue-600 hover:underline"
            >
              查看全部
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <p className="py-8 text-center text-gray-900">暫無銷售記錄</p>
          ) : (
            <div className="space-y-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between rounded border border-gray-200 p-3"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {sale.sale_no}
                    </div>
                    <div className="text-sm text-gray-900">
                      {sale.customer_code || '散客'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">
                      {formatCurrency(sale.total)}
                    </div>
                    <div className="text-xs text-gray-900">
                      {new Date(sale.created_at).toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">快速操作</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Link
              href="/pos"
              className="flex flex-col items-center rounded-lg border-2 border-blue-200 bg-blue-50 p-4 text-center transition-colors hover:bg-blue-100"
            >
              <div className="mb-2 text-3xl">🛒</div>
              <div className="font-semibold text-gray-900">POS 收銀</div>
            </Link>

            <Link
              href="/products/new"
              className="flex flex-col items-center rounded-lg border-2 border-green-200 bg-green-50 p-4 text-center transition-colors hover:bg-green-100"
            >
              <div className="mb-2 text-3xl">📦</div>
              <div className="font-semibold text-gray-900">新增商品</div>
            </Link>

            <Link
              href="/purchases/new"
              className="flex flex-col items-center rounded-lg border-2 border-purple-200 bg-purple-50 p-4 text-center transition-colors hover:bg-purple-100"
            >
              <div className="mb-2 text-3xl">📥</div>
              <div className="font-semibold text-gray-900">新增進貨</div>
            </Link>

            <Link
              href="/ar"
              className="flex flex-col items-center rounded-lg border-2 border-orange-200 bg-orange-50 p-4 text-center transition-colors hover:bg-orange-100"
            >
              <div className="mb-2 text-3xl">💰</div>
              <div className="font-semibold text-gray-900">收款</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
