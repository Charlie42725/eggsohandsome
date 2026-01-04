'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Vendor } from '@/types'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null)

  const fetchVendors = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      if (activeFilter !== null) params.set('active', String(activeFilter))

      const res = await fetch(`/api/vendors?${params}`)
      const data = await res.json()
      if (data.ok) {
        setVendors(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch vendors:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVendors()
  }, [activeFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchVendors()
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })

      if (res.ok) {
        fetchVendors()
      }
    } catch (err) {
      console.error('Failed to update vendor:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">廠商管理</h1>
          <Link
            href="/vendors/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增廠商
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋廠商名稱、編號、電話或 Email"
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

        {/* Vendors table */}
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : vendors.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有廠商資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">廠商編號</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">廠商名稱</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">聯絡人</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">電話</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Email</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">付款條件</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{vendor.vendor_code}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{vendor.vendor_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{vendor.contact_person || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{vendor.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{vendor.email || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{vendor.payment_terms || '-'}</td>
                      <td className="px-6 py-4 text-center text-sm">
                        <span
                          className={`inline-block rounded px-2 py-1 text-xs ${
                            vendor.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {vendor.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <button
                          onClick={() => toggleActive(vendor.id, vendor.is_active)}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {vendor.is_active ? '停用' : '啟用'}
                        </button>
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
