'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'

type DashboardStats = {
  todaySales: number
  todayOrders: number
  totalAR: number
  totalAP: number
  lowStockCount: number
  overdueAR: number
  overdueAP: number
}

type Product = {
  id: string
  name: string
  stock: number
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
    totalAR: 0,
    totalAP: 0,
    lowStockCount: 0,
    overdueAR: 0,
    overdueAP: 0,
  })
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch today's sales
      const today = new Date().toISOString().split('T')[0]
      const salesRes = await fetch(`/api/sales?date_from=${today}&date_to=${today}`)
      const salesData = await salesRes.json()
      const todaySalesData = salesData.ok ? salesData.data : []
      const todaySales = todaySalesData
        .filter((s: any) => s.status === 'confirmed')
        .reduce((sum: number, s: any) => sum + s.total, 0)

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

      // Fetch low stock products
      const productsRes = await fetch('/api/products?active=true')
      const productsData = await productsRes.json()
      const allProducts = productsData.ok ? productsData.data : []
      const lowStock = allProducts
        .filter((p: any) => p.stock < 10)
        .sort((a: any, b: any) => a.stock - b.stock)
        .slice(0, 10)

      setStats({
        todaySales,
        todayOrders: todaySalesData.length,
        totalAR,
        totalAP,
        lowStockCount: allProducts.filter((p: any) => p.stock < 10).length,
        overdueAR,
        overdueAP,
      })

      setLowStockProducts(lowStock)

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
        <h1 className="mb-6 text-3xl font-bold text-gray-900">儀表板</h1>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">今日營收</div>
            <div className="mt-2 text-3xl font-bold text-green-600">
              {formatCurrency(stats.todaySales)}
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {stats.todayOrders} 筆訂單
            </div>
          </div>

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

          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-900">低庫存商品</div>
            <div className="mt-2 text-3xl font-bold text-red-600">
              {stats.lowStockCount}
            </div>
            <div className="mt-1 text-sm text-gray-900">庫存 &lt; 10 件</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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

          {/* Low Stock Products */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                低庫存商品
              </h2>
              <Link
                href="/products"
                className="text-sm text-blue-600 hover:underline"
              >
                查看商品庫
              </Link>
            </div>

            {lowStockProducts.length === 0 ? (
              <p className="py-8 text-center text-gray-900">庫存充足</p>
            ) : (
              <div className="space-y-3">
                {lowStockProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded border border-gray-200 p-3"
                  >
                    <div className="font-medium text-gray-900">
                      {product.name}
                    </div>
                    <div
                      className={`font-semibold ${
                        product.stock === 0
                          ? 'text-red-600'
                          : product.stock < 5
                          ? 'text-orange-600'
                          : 'text-yellow-600'
                      }`}
                    >
                      剩餘 {product.stock}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
