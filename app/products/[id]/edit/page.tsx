'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import type { Product } from '@/types'

type StockAdjustment = {
  id: string
  product_id: string
  previous_stock: number
  adjusted_stock: number
  difference: number
  note: string | null
  created_at: string
}

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Stock adjustment states
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([])
  const [showAdjustForm, setShowAdjustForm] = useState(false)
  const [adjustedStock, setAdjustedStock] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => {
    fetchProduct()
    fetchAdjustments()
  }, [productId])

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/products/${productId}`)
      const data = await res.json()
      if (data.ok) {
        setProduct(data.data)
      } else {
        setError('商品不存在')
      }
    } catch (err) {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const fetchAdjustments = async () => {
    try {
      const res = await fetch(`/api/products/${productId}/adjustments`)
      const data = await res.json()
      if (data.ok) {
        setAdjustments(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch adjustments:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const formData = new FormData(e.currentTarget)

    const data = {
      name: formData.get('name'),
      barcode: formData.get('barcode') || null,
      price: parseFloat(formData.get('price') as string) || 0,
      cost: parseFloat(formData.get('cost') as string) || 0,
      allow_negative: formData.get('allow_negative') === 'on',
    }

    console.log('Updating product with data:', data)

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()
      console.log('Update result:', result)

      if (result.ok) {
        setSuccess('商品資訊已更新')
        setProduct(result.data)
        // Auto-hide success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(result.error || '更新失敗')
      }
    } catch (err) {
      console.error('Update error:', err)
      setError('更新失敗')
    } finally {
      setSaving(false)
    }
  }

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) return

    const stock = parseInt(adjustedStock)
    if (isNaN(stock) || stock < 0) {
      alert('請輸入有效的庫存數量')
      return
    }

    setAdjusting(true)
    try {
      const res = await fetch(`/api/products/${productId}/adjust-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adjusted_stock: stock,
          note: adjustNote || null,
        }),
      })

      const result = await res.json()

      if (result.ok) {
        alert(
          `盤點完成！\n` +
          `盤點前：${result.data.adjustment.previous_stock}\n` +
          `盤點後：${result.data.adjustment.adjusted_stock}\n` +
          `差異：${result.data.adjustment.difference > 0 ? '+' : ''}${result.data.adjustment.difference}`
        )
        setProduct(result.data.product)
        setAdjustedStock('')
        setAdjustNote('')
        setShowAdjustForm(false)
        fetchAdjustments()
      } else {
        alert(`盤點失敗：${result.error}`)
      }
    } catch (err) {
      alert('盤點失敗')
    } finally {
      setAdjusting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-xl text-gray-900">載入中...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-xl text-gray-900">商品不存在</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">編輯商品</h1>

        {/* Product Info */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">品號</label>
            <div className="rounded border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900">
              {product.item_code}
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">目前庫存</label>
              <div className="text-2xl font-bold text-gray-900">{product.stock}</div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">平均成本</label>
              <div className="text-2xl font-bold text-gray-900">NT$ {product.avg_cost.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Stock Adjustment Section */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-6 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">庫存盤點</h3>
            {!showAdjustForm && (
              <button
                type="button"
                onClick={() => setShowAdjustForm(true)}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                開始盤點
              </button>
            )}
          </div>

          {showAdjustForm && (
            <form onSubmit={handleAdjustStock} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">
                  實際盤點數量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={adjustedStock}
                  onChange={(e) => setAdjustedStock(e.target.value)}
                  min="0"
                  step="1"
                  required
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  placeholder="輸入實際盤點的庫存數量"
                />
                {adjustedStock && product && (
                  <p className="mt-1 text-xs text-gray-900">
                    差異：
                    <span className={
                      parseInt(adjustedStock) - product.stock > 0
                        ? 'text-green-600'
                        : parseInt(adjustedStock) - product.stock < 0
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }>
                      {parseInt(adjustedStock) - product.stock > 0 ? '+' : ''}
                      {parseInt(adjustedStock) - product.stock}
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">備註</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  placeholder="盤點原因或說明（選填）"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustForm(false)
                    setAdjustedStock('')
                    setAdjustNote('')
                  }}
                  className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={adjusting}
                  className="flex-1 rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {adjusting ? '處理中...' : '確認盤點'}
                </button>
              </div>
            </form>
          )}

          {/* Adjustment History */}
          {adjustments.length > 0 && (
            <div className="mt-4 border-t border-blue-200 pt-3">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">盤點記錄</h4>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-blue-200">
                    <tr>
                      <th className="pb-1 text-left text-gray-900">日期</th>
                      <th className="pb-1 text-right text-gray-900">盤點前</th>
                      <th className="pb-1 text-right text-gray-900">盤點後</th>
                      <th className="pb-1 text-right text-gray-900">差異</th>
                      <th className="pb-1 text-left text-gray-900">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {adjustments.map((adj) => (
                      <tr key={adj.id}>
                        <td className="py-1 text-gray-900">{formatDate(adj.created_at)}</td>
                        <td className="py-1 text-right text-gray-900">{adj.previous_stock}</td>
                        <td className="py-1 text-right text-gray-900">{adj.adjusted_stock}</td>
                        <td className={`py-1 text-right ${
                          adj.difference > 0 ? 'text-green-600' : adj.difference < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {adj.difference > 0 ? '+' : ''}{adj.difference}
                        </td>
                        <td className="py-1 text-gray-900">{adj.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">編輯商品資訊</h2>

          {error && (
            <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
          )}

          {success && (
            <div className="mb-4 rounded bg-green-50 p-3 text-green-700">{success}</div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              商品名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              key={`name-${product.name}`}
              defaultValue={product.name}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">條碼</label>
            <input
              type="text"
              name="barcode"
              key={`barcode-${product.barcode}`}
              defaultValue={product.barcode || ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                }
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
              placeholder="選填"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                售價 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                required
                min="0"
                step="0.01"
                key={`price-${product.price}`}
                defaultValue={product.price}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">
                成本 <span className="text-xs text-gray-500">（參考成本，可隨時修改）</span>
              </label>
              <input
                type="number"
                name="cost"
                min="0"
                step="0.01"
                key={`cost-${product.cost}`}
                defaultValue={product.cost}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="allow_negative"
                defaultChecked={product.allow_negative}
                className="h-4 w-4"
              />
              <span className="text-sm text-gray-900">允許負庫存</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {saving ? '儲存中...' : '儲存變更'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
