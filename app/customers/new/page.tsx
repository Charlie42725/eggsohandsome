'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewCustomerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    const data = {
      customer_code: formData.get('customer_code'),
      customer_name: formData.get('customer_name'),
      phone: formData.get('phone') || null,
      line_id: formData.get('line_id') || null,
      email: formData.get('email') || null,
      address: formData.get('address') || null,
      payment_method: formData.get('payment_method') || null,
      note: formData.get('note') || null,
    }

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()

      if (result.ok) {
        router.push('/customers')
      } else {
        setError(result.error || '建立失敗')
      }
    } catch (err) {
      setError('建立失敗')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">新增客戶</h1>

        <form onSubmit={handleSubmit} className="rounded-lg bg-white p-6 shadow">
          {error && (
            <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
          )}

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              客戶編號 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="customer_code"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
              placeholder="例：C0001"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">
              客戶名稱 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="customer_name"
              required
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">電話</label>
              <input
                type="text"
                name="phone"
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
                placeholder="選填"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900">LINE ID</label>
              <input
                type="text"
                name="line_id"
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
                placeholder="選填"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">Email</label>
            <input
              type="email"
              name="email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
              placeholder="選填"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">地址</label>
            <input
              type="text"
              name="address"
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
              placeholder="選填"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-900">付款方式</label>
            <select
              name="payment_method"
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
            >
              <option value="">請選擇</option>
              <option value="cash">現金</option>
              <option value="card">刷卡</option>
              <option value="transfer">轉帳</option>
              <option value="cod">貨到付款</option>
            </select>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-gray-900">備註</label>
            <textarea
              name="note"
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900"
              placeholder="選填"
            />
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
              disabled={loading}
              className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {loading ? '建立中...' : '建立客戶'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
