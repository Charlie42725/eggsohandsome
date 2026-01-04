'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (activeFilter !== null) params.set('active', String(activeFilter))

      const res = await fetch(`/api/products?${params}`)
      const data = await res.json()
      if (data.ok) {
        setProducts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [activeFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchProducts()
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">商品庫</h1>
          <Link
            href="/products/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增商品
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋商品名稱、品號或條碼"
              className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 placeholder:text-gray-900"
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
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFilter(true)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === true
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              上架
            </button>
            <button
              onClick={() => setActiveFilter(false)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              下架
            </button>
          </div>
        </div>

        {/* Products table */}
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : products.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有商品</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">品號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">條碼</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">商品名稱</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">單位</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">售價</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">成本</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">庫存</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{product.item_code}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.barcode || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.unit}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-900">
                        {formatCurrency(product.cost)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <span
                          className={
                            product.stock <= 0
                              ? 'font-semibold text-red-600'
                              : product.stock < 10
                              ? 'font-semibold text-yellow-600'
                              : 'text-gray-900'
                          }
                        >
                          {product.stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs ${
                            product.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {product.is_active ? '上架' : '下架'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            編輯
                          </Link>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => toggleActive(product.id, product.is_active)}
                            className="font-medium text-green-600 hover:underline"
                          >
                            {product.is_active ? '下架' : '上架'}
                          </button>
                          <span className="text-gray-300">|</span>
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
        </div>
      </div>
    </div>
  )
}
