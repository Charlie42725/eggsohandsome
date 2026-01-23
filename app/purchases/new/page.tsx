'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

type Vendor = {
  id: string
  vendor_code: string
  vendor_name: string
}

type PurchaseItem = {
  product_id: string
  product?: Product
  quantity: number
  cost: number
}

export default function NewPurchasePage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorCode, setVendorCode] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors')
      const data = await res.json()
      if (data.ok) {
        setVendors(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err)
    }
  }

  const searchProducts = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/products/search?keyword=${encodeURIComponent(query)}&active_only=false`)
      const data = await res.json()
      console.log('Search API response:', data) // Debug log
      if (data.ok) {
        setSearchResults(data.data || [])
        console.log('Search results:', data.data) // Debug log
      } else {
        console.error('Search API error:', data.error)
        setSearchResults([])
      }
    } catch (err) {
      console.error('Search error:', err)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const addItem = (product: Product) => {
    console.log('Adding product:', product) // Debug log
    const existing = items.find((item) => item.product_id === product.id)
    if (existing) {
      setError('商品已在清單中')
      setTimeout(() => setError(''), 3000)
      return
    }

    setItems([
      ...items,
      {
        product_id: product.id,
        product,
        quantity: 1,
        cost: product.cost || 0,
      },
    ])
    setSearchKeyword('')
    setSearchResults([])
    setError('')
    console.log('Product added successfully') // Debug log
  }

  const updateItem = (index: number, field: 'quantity' | 'cost' | 'subtotal', value: number) => {
    setItems(
      items.map((item, i) => {
        if (i !== index) return item

        if (field === 'subtotal') {
          // 輸入小計，自動計算單位成本
          const newCost = item.quantity > 0 ? value / item.quantity : 0
          return { ...item, cost: newCost }
        } else if (field === 'quantity' && value > 0) {
          // 數量變更時，保持小計不變，重算單位成本
          const currentSubtotal = item.quantity * item.cost
          const newCost = currentSubtotal / value
          return { ...item, quantity: value, cost: newCost }
        } else {
          return { ...item, [field]: value }
        }
      })
    )
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.cost, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!vendorCode) {
      setError('請選擇廠商')
      return
    }

    if (items.length === 0) {
      setError('請至少新增一項商品')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_code: vendorCode,
          is_paid: isPaid,
          items: items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            cost: item.cost,
          })),
        }),
      })

      const data = await res.json()

      if (data.ok) {
        router.push('/purchases')
      } else {
        setError(data.error || '建立失敗')
      }
    } catch (err) {
      setError('建立失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-gray-100">新增進貨單</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded bg-red-50 p-3 text-red-700 dark:bg-red-900/20 dark:text-red-400">{error}</div>
          )}

          {/* Vendor selection */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 md:p-6">
            <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
              廠商 <span className="text-red-500">*</span>
            </label>
            <select
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value)}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              required
            >
              <option value="">請選擇廠商</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.vendor_code}>
                  {vendor.vendor_code} - {vendor.vendor_name}
                </option>
              ))}
            </select>

            {/* Payment status */}
            <div className="mt-4 flex items-center">
              <input
                type="checkbox"
                id="isPaid"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isPaid" className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                已付款（勾選後不會產生應付帳款）
              </label>
            </div>
          </div>

          {/* Product search */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 md:p-6">
            <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">搜尋商品</label>
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value)
                searchProducts(e.target.value)
              }}
              placeholder="輸入商品名稱或品號"
              className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
            />

            {/* Search status and results */}
            {searching && (
              <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-center text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100">
                搜尋中...
              </div>
            )}

            {!searching && searchKeyword && searchResults.length === 0 && (
              <div className="mt-2 rounded border border-gray-200 bg-yellow-50 p-3 text-center text-sm text-gray-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                找不到商品，請確認商品是否存在
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
                {searchResults.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addItem(product)}
                    className="w-full border-b border-gray-100 p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                    <div className="text-sm text-gray-900 dark:text-gray-300">
                      {product.item_code} | 成本: {formatCurrency(product.cost)} | 庫存: {product.stock}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800 md:p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">進貨明細</h2>

            {items.length === 0 ? (
              <p className="py-8 text-center text-gray-900 dark:text-gray-100">尚未新增商品</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">商品</th>
                      <th className="px-4 py-2 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">數量</th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <span>單位成本</span>
                        <span className="block text-xs font-normal text-gray-500">自動計算</span>
                      </th>
                      <th className="px-4 py-2 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <span>小計</span>
                        <span className="block text-xs font-normal text-gray-500">可直接輸入</span>
                      </th>
                      <th className="px-4 py-2 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{item.product?.name}</div>
                          <div className="text-sm text-gray-900 dark:text-gray-300">
                            {item.product?.item_code}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(index, 'quantity', parseInt(e.target.value) || 0)
                            }
                            min="1"
                            className="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-center text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={item.cost}
                            onChange={(e) =>
                              updateItem(index, 'cost', parseFloat(e.target.value) || 0)
                            }
                            min="0"
                            step="0.01"
                            className="w-28 rounded border border-gray-300 bg-white px-2 py-1 text-right text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            value={Math.round(item.quantity * item.cost * 100) / 100}
                            onChange={(e) =>
                              updateItem(index, 'subtotal', parseFloat(e.target.value) || 0)
                            }
                            min="0"
                            step="0.01"
                            className="w-28 rounded border border-gray-300 bg-white px-2 py-1 text-right font-semibold text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                        合計
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(total)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || items.length === 0}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              {loading ? '建立中...' : '確認進貨'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
