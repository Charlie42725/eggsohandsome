'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import type { Product } from '@/types'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProduct()
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    const data = {
      name: formData.get('name'),
      barcode: formData.get('barcode') || null,
      price: parseFloat(formData.get('price') as string) || 0,
      cost: parseFloat(formData.get('cost') as string) || 0,
      unit: formData.get('unit') || '件',
      allow_negative: formData.get('allow_negative') === 'on',
    }

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()

      if (result.ok) {
        router.push('/products')
      } else {
        setError(result.error || '更新失敗')
      }
    } catch (err) {
      setError('更新失敗')
    } finally {
      setSaving(false)
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

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow">
          {error && (
            <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              品號
            </label>
            <input
              type="text"
              value={product.item_code}
              disabled
              className="w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 text-gray-900"
            />
            <p className="mt-1 text-xs text-gray-900">品號不可修改</p>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              商品名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              defaultValue={product.name}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">條碼</label>
            <input
              type="text"
              name="barcode"
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
                defaultValue={product.price}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">成本</label>
              <input
                type="number"
                name="cost"
                min="0"
                step="0.01"
                defaultValue={product.cost}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">單位</label>
            <input
              type="text"
              name="unit"
              defaultValue={product.unit}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm text-gray-900">
              <strong>目前庫存：</strong>{product.stock} {product.unit}
            </div>
            <div className="text-sm text-gray-900">
              <strong>平均成本：</strong>NT$ {product.avg_cost.toFixed(2)}
            </div>
            <p className="mt-1 text-xs text-gray-900">庫存和平均成本由系統自動計算，無法手動修改</p>
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
