'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Customer } from '@/types'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState<Partial<Customer>>({})
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (activeFilter !== null) params.set('active', String(activeFilter))

      const res = await fetch(`/api/customers?${params}`)
      const data = await res.json()
      if (data.ok) {
        setCustomers(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [activeFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCustomers()
  }

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer)
    setFormData(customer)
    setError('')
  }

  const closeEditModal = () => {
    setEditingCustomer(null)
    setFormData({})
    setError('')
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCustomer) return

    setProcessing(true)
    setError('')

    try {
      const res = await fetch(`/api/customers?id=${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (data.ok) {
        fetchCustomers()
        closeEditModal()
      } else {
        setError(data.error || '更新失敗')
      }
    } catch (err) {
      setError('更新失敗')
    } finally {
      setProcessing(false)
    }
  }

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`確定要刪除客戶「${customer.customer_name}」嗎？\n\n此操作無法復原。`)) {
      return
    }

    try {
      const res = await fetch(`/api/customers?id=${customer.id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        fetchCustomers()
        alert('刪除成功')
      } else {
        alert(data.error || '刪除失敗')
      }
    } catch (err) {
      alert('刪除失敗')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">客戶管理</h1>
          <Link
            href="/customers/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增客戶
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋客戶名稱、編號、電話或 Email"
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
              啟用
            </button>
            <button
              onClick={() => setActiveFilter(false)}
              className={`rounded px-4 py-1 font-medium ${
                activeFilter === false
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
              }`}
            >
              停用
            </button>
          </div>
        </div>

        {/* Customers table */}
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有客戶資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">客戶編號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">客戶名稱</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">電話</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">付款方式</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">LINE ID</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{customer.customer_code}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{customer.customer_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{customer.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{customer.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {customer.payment_method === 'cash' && '現金'}
                        {customer.payment_method === 'card' && '刷卡'}
                        {customer.payment_method === 'transfer' && '轉帳'}
                        {customer.payment_method === 'cod' && '貨到付款'}
                        {!customer.payment_method && '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{customer.line_id || '-'}</td>
                      <td className="px-6 py-4 text-center text-sm">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs ${
                            customer.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {customer.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openEditModal(customer)}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(customer)}
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

      {/* Edit Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900">編輯客戶</h2>

            {error && (
              <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">
                    客戶編號 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customer_code || ''}
                    onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">
                    客戶名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customer_name || ''}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">電話</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">LINE ID</label>
                  <input
                    type="text"
                    value={formData.line_id || ''}
                    onChange={(e) => setFormData({ ...formData, line_id: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900">付款方式</label>
                  <select
                    value={formData.payment_method || ''}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  >
                    <option value="">請選擇</option>
                    <option value="cash">現金</option>
                    <option value="card">刷卡</option>
                    <option value="transfer">轉帳</option>
                    <option value="cod">貨到付款</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">地址</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">備註</label>
                <textarea
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active ?? true}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-gray-900">啟用</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {processing ? '更新中...' : '確認更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
