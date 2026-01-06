'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

type SortField = 'item_code' | 'name' | 'price' | 'avg_cost' | 'stock' | 'updated_at'
type SortOrder = 'asc' | 'desc'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 0
  })
  const [sortBy, setSortBy] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([])
  const [loadingLowStock, setLoadingLowStock] = useState(true)
  const [showLowStock, setShowLowStock] = useState(false)

  const fetchProducts = async (currentPage: number = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (activeFilter !== null) params.set('active', String(activeFilter))
      params.set('page', String(currentPage))
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)

      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      if (data.ok) {
        setProducts(data.data || [])
        setPagination(data.pagination)
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchLowStockProducts = async () => {
    setLoadingLowStock(true)
    try {
      const res = await fetch('/api/products?active=true')
      const data = await res.json()
      if (data.ok) {
        const allProducts = data.data || []
        const lowStock = allProducts
          .filter((p: Product) => p.stock < 10)
          .sort((a: Product, b: Product) => a.stock - b.stock)
          .slice(0, 10)
        setLowStockProducts(lowStock)
      }
    } catch (err) {
      console.error('Failed to fetch low stock products:', err)
    } finally {
      setLoadingLowStock(false)
    }
  }

  useEffect(() => {
    setPage(1)
    fetchProducts(1)
  }, [activeFilter, sortBy, sortOrder])

  useEffect(() => {
    fetchLowStockProducts()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchProducts(1)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchProducts(newPage)
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })

      if (res.ok) {
        fetchProducts()
      }
    } catch (err) {
      console.error('Failed to update product:', err)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定要刪除商品「${name}」嗎？\n\n注意：此操作無法復原`)) {
      return
    }

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('商品已刪除')
        fetchProducts()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
      console.error('Failed to delete product:', err)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // Default to desc for new field
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) {
      return <span className="ml-1 text-gray-400">↕</span>
    }
    return <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">商品庫</h1>
          <Link
            href="/products/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增商品
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋商品名稱、品號或條碼"
              className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700 placeholder:text-gray-900 dark:placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              搜尋
            </button>
          </form>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveFilter(null)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFilter(true)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              上架
            </button>
            <button
              onClick={() => setActiveFilter(false)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              下架
            </button>
          </div>
        </div>

        {/* Low Stock Products Alert */}
        {!loadingLowStock && lowStockProducts.length > 0 && (
          <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 shadow">
            <button
              onClick={() => setShowLowStock(!showLowStock)}
              className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  低庫存商品提醒
                </span>
                <span className="rounded bg-red-100 dark:bg-red-900 px-3 py-1 text-sm font-medium text-red-800 dark:text-red-200">
                  {lowStockProducts.length} 項
                </span>
              </div>
              <span className="text-2xl text-gray-900 dark:text-gray-100">
                {showLowStock ? '−' : '+'}
              </span>
            </button>

            {showLowStock && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="space-y-3">
                  {lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {product.name}
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-400">
                          品號: {product.item_code}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div
                          className={`text-right font-semibold ${
                            product.stock === 0
                              ? 'text-red-600'
                              : product.stock < 5
                              ? 'text-orange-600'
                              : 'text-yellow-600'
                          }`}
                        >
                          <div className="text-lg">剩餘 {product.stock}</div>
                          <div className="text-xs font-normal text-gray-900 dark:text-gray-400">
                            {product.stock === 0 ? '缺貨' : '庫存不足'}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            補貨
                          </Link>
                          <button
                            onClick={() => toggleActive(product.id, product.is_active)}
                            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
                          >
                            下架
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Products table */}
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">沒有商品</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('item_code')}
                    >
                      <div className="flex items-center">
                        品號
                        <SortIcon field="item_code" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">條碼</th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">
                        商品名稱
                        <SortIcon field="name" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('price')}
                    >
                      <div className="flex items-center justify-end">
                        售價
                        <SortIcon field="price" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('avg_cost')}
                    >
                      <div className="flex items-center justify-end">
                        成本
                        <SortIcon field="avg_cost" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('stock')}
                    >
                      <div className="flex items-center justify-end whitespace-nowrap">
                        庫存
                        <SortIcon field="stock" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none"
                      onClick={() => handleSort('updated_at')}
                    >
                      <div className="flex items-center">
                        更新時間
                        <SortIcon field="updated_at" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <div className="flex items-center justify-center">狀態</div>
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <div className="flex items-center justify-center">操作</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{product.item_code}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">{product.barcode || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{product.name}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900 dark:text-gray-100">
                        {formatCurrency(product.avg_cost)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <span
                          className={
                            product.stock <= 0
                              ? 'font-semibold text-red-600'
                              : product.stock < 10
                              ? 'font-semibold text-yellow-600'
                              : 'text-gray-900 dark:text-gray-100'
                          }
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {product.updated_at
                          ? (() => {
                              const date = new Date(product.updated_at + 'Z')
                              return date.toLocaleString('zh-TW', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })
                            })()
                          : '-'
                        }
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs whitespace-nowrap ${
                            product.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {product.is_active ? '上架' : '下架'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            編輯
                          </Link>
                          <span className="text-gray-300 dark:text-gray-600">|</span>
                          <button
                            onClick={() => toggleActive(product.id, product.is_active)}
                            className="font-medium text-green-600 hover:underline"
                          >
                            {product.is_active ? '下架' : '上架'}
                          </button>
                          <span className="text-gray-300 dark:text-gray-600">|</span>
                          <button
                            onClick={() => handleDelete(product.id, product.name)}
                            className="font-medium text-red-600 hover:underline"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && products.length > 0 && pagination.totalPages > 1 && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  顯示第 {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} 筆，共 {pagination.total} 筆
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一頁
                  </button>

                  {/* Page numbers */}
                  <div className="flex gap-1">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                      .filter(p => {
                        // Show first page, last page, current page, and pages around current
                        return p === 1 ||
                               p === pagination.totalPages ||
                               (p >= page - 2 && p <= page + 2)
                      })
                      .map((p, idx, arr) => {
                        // Add ellipsis if there's a gap
                        const showEllipsisBefore = idx > 0 && arr[idx - 1] !== p - 1
                        return (
                          <div key={p} className="flex items-center gap-1">
                            {showEllipsisBefore && <span className="px-2 text-gray-500 dark:text-gray-400">...</span>}
                            <button
                              onClick={() => handlePageChange(p)}
                              className={`min-w-[2rem] rounded px-3 py-1 text-sm ${
                                p === page
                                  ? 'bg-blue-600 text-white'
                                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {p}
                            </button>
                          </div>
                        )
                      })}
                  </div>

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === pagination.totalPages}
                    className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
