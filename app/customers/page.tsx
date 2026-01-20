'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Customer, PointProgram, CustomerPoints, PointLog } from '@/types'
import { MoreHorizontal, Edit, Trash2, Coins, Gift, History, ArrowRight } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [programs, setPrograms] = useState<PointProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [formData, setFormData] = useState<Partial<Customer>>({})
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // 點數管理相關狀態
  const [pointsCustomer, setPointsCustomer] = useState<Customer | null>(null)
  const [customerPoints, setCustomerPoints] = useState<CustomerPoints[]>([])
  const [pointLogs, setPointLogs] = useState<PointLog[]>([])
  const [loadingPoints, setLoadingPoints] = useState(false)

  // 兌換 modal
  const [redeemingProgram, setRedeemingProgram] = useState<CustomerPoints | null>(null)
  const [selectedTier, setSelectedTier] = useState<string>('')
  const [redeemError, setRedeemError] = useState('')

  // 調整點數 modal
  const [adjustingPoints, setAdjustingPoints] = useState<CustomerPoints | null>(null)
  const [adjustAmount, setAdjustAmount] = useState<string>('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustError, setAdjustError] = useState('')

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

  const fetchPrograms = async () => {
    try {
      const res = await fetch('/api/point-programs')
      const data = await res.json()
      if (data.ok) {
        setPrograms(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch programs:', err)
    }
  }

  const fetchCustomerPoints = async (customerId: string) => {
    setLoadingPoints(true)
    try {
      const [pointsRes, logsRes] = await Promise.all([
        fetch(`/api/customer-points?customer_id=${customerId}`),
        fetch(`/api/customer-points/logs?customer_id=${customerId}`)
      ])

      const pointsData = await pointsRes.json()
      const logsData = await logsRes.json()

      if (pointsData.ok) {
        setCustomerPoints(pointsData.data || [])
      }
      if (logsData.ok) {
        setPointLogs(logsData.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch customer points:', err)
    } finally {
      setLoadingPoints(false)
    }
  }

  useEffect(() => {
    Promise.all([fetchCustomers(), fetchPrograms()])
  }, [activeFilter])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setCurrentPage(1)
    fetchCustomers()
  }

  // 分頁計算
  const totalPages = Math.ceil(customers.length / pageSize)
  const paginatedCustomers = customers.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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

  // 點數管理
  const openPointsModal = (customer: Customer) => {
    setPointsCustomer(customer)
    fetchCustomerPoints(customer.id)
  }

  const closePointsModal = () => {
    setPointsCustomer(null)
    setCustomerPoints([])
    setPointLogs([])
    setRedeemingProgram(null)
    setAdjustingPoints(null)
  }

  // 兌換
  const openRedeemModal = (cp: CustomerPoints) => {
    setRedeemingProgram(cp)
    setSelectedTier('')
    setRedeemError('')
  }

  const handleRedeem = async () => {
    if (!redeemingProgram || !selectedTier || !pointsCustomer) return

    setProcessing(true)
    setRedeemError('')

    try {
      const res = await fetch('/api/customer-points/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: pointsCustomer.id,
          program_id: redeemingProgram.program_id,
          tier_id: selectedTier,
        })
      })

      const data = await res.json()

      if (data.ok) {
        alert(`兌換成功！獲得購物金 $${data.data.reward_value}`)
        setRedeemingProgram(null)
        fetchCustomerPoints(pointsCustomer.id)
        fetchCustomers()
      } else {
        setRedeemError(data.error || '兌換失敗')
      }
    } catch (err) {
      setRedeemError('兌換失敗')
    } finally {
      setProcessing(false)
    }
  }

  // 調整點數
  const openAdjustModal = (cp: CustomerPoints) => {
    setAdjustingPoints(cp)
    setAdjustAmount('')
    setAdjustNote('')
    setAdjustError('')
  }

  const handleAdjustPoints = async () => {
    if (!adjustingPoints || !pointsCustomer) return

    const amount = parseInt(adjustAmount)
    if (isNaN(amount) || amount === 0) {
      setAdjustError('請輸入有效的點數')
      return
    }

    setProcessing(true)
    setAdjustError('')

    try {
      const res = await fetch('/api/customer-points/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: pointsCustomer.id,
          program_id: adjustingPoints.program_id,
          points: amount,
          note: adjustNote || undefined,
        })
      })

      const data = await res.json()

      if (data.ok) {
        alert('調整成功')
        setAdjustingPoints(null)
        fetchCustomerPoints(pointsCustomer.id)
      } else {
        setAdjustError(data.error || '調整失敗')
      }
    } catch (err) {
      setAdjustError('調整失敗')
    } finally {
      setProcessing(false)
    }
  }

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case 'earn': return '累積'
      case 'redeem': return '兌換'
      case 'expire': return '過期'
      case 'adjust': return '調整'
      default: return type
    }
  }

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'earn': return 'text-green-600 dark:text-green-400'
      case 'redeem': return 'text-blue-600 dark:text-blue-400'
      case 'expire': return 'text-gray-500'
      case 'adjust': return 'text-orange-600 dark:text-orange-400'
      default: return 'text-gray-600'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">客戶管理</h1>
          <Link
            href="/customers/new"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            + 新增客戶
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋客戶名稱、編號、電話、地址"
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
              className={`rounded px-4 py-1 font-medium ${activeFilter === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveFilter(true)}
              className={`rounded px-4 py-1 font-medium ${activeFilter === true
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              啟用
            </button>
            <button
              onClick={() => setActiveFilter(false)}
              className={`rounded px-4 py-1 font-medium ${activeFilter === false
                ? 'bg-red-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
            >
              停用
            </button>
          </div>
        </div>

        {/* Customers table */}
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">沒有客戶資料</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">客戶編號</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">客戶名稱</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">電話</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">門市地址</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">宅配地址</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">付款方式</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-400">LINE ID</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">狀態</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedCustomers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{customer.customer_code}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{customer.customer_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{customer.phone || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="max-w-[200px] truncate" title={customer.store_address || ''}>
                          {customer.store_address || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="max-w-[200px] truncate" title={customer.delivery_address || ''}>
                          {customer.delivery_address || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {customer.payment_method === 'cash' && '現金'}
                          {customer.payment_method === 'card' && '刷卡'}
                          {customer.payment_method === 'transfer' && '轉帳'}
                          {customer.payment_method === 'cod' && '貨到付款'}
                          {!customer.payment_method && '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{customer.line_id || '-'}</td>
                      <td className="px-4 py-3 text-center text-sm">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${customer.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                            }`}
                        >
                          {customer.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openPointsModal(customer)}>
                              <Coins className="mr-2 h-4 w-4" />
                              管理點數
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditModal(customer)}>
                              <Edit className="mr-2 h-4 w-4" />
                              編輯
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(customer)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              刪除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分頁控制 */}
          {!loading && customers.length > 0 && (
            <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                共 {customers.length} 筆資料，顯示第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, customers.length)} 筆
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                >
                  <option value={10}>10 筆/頁</option>
                  <option value={20}>20 筆/頁</option>
                  <option value={50}>50 筆/頁</option>
                  <option value={100}>100 筆/頁</option>
                </select>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded px-3 py-1 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  上一頁
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded px-3 py-1 text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  下一頁
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">編輯客戶</h2>

            {error && (
              <div className="mb-4 rounded bg-red-50 dark:bg-red-900 p-3 text-red-700 dark:text-red-200">{error}</div>
            )}

            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                    客戶編號 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customer_code || ''}
                    onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                    客戶名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.customer_name || ''}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">電話</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">LINE ID</label>
                  <input
                    type="text"
                    value={formData.line_id || ''}
                    onChange={(e) => setFormData({ ...formData, line_id: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">付款方式</label>
                  <select
                    value={formData.payment_method || ''}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
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
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">門市地址</label>
                <input
                  type="text"
                  value={formData.store_address || ''}
                  onChange={(e) => setFormData({ ...formData, store_address: e.target.value })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  placeholder="客戶店面地址"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">宅配地址</label>
                <input
                  type="text"
                  value={formData.delivery_address || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_address: e.target.value })}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  placeholder="宅配或郵寄地址"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">備註</label>
                <textarea
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
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
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">啟用</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-800 hover:bg-gray-50"
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

      {/* Points Modal */}
      {pointsCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white dark:bg-gray-800 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {pointsCustomer.customer_name} 的點數
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {pointsCustomer.customer_code}
                </p>
              </div>
              <button
                onClick={closePointsModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingPoints ? (
              <div className="py-8 text-center text-gray-500">載入中...</div>
            ) : (
              <>
                {/* 點數卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {customerPoints.map((cp) => (
                    <div
                      key={cp.program_id}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {cp.program?.name || '點數計劃'}
                        </h3>
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {cp.points} 點
                        </span>
                      </div>

                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                        <div>累計獲得: {cp.total_earned} 點</div>
                        <div>累計兌換: {cp.total_redeemed} 點</div>
                        <div>預估成本: ${Number(cp.estimated_cost).toFixed(0)}</div>
                      </div>

                      {/* 兌換方案 */}
                      {cp.program?.tiers && cp.program.tiers.length > 0 && (
                        <div className="border-t dark:border-gray-700 pt-3 mt-3">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            兌換方案：
                          </div>
                          <div className="space-y-1 mb-3">
                            {cp.program.tiers.map((tier) => (
                              <div
                                key={tier.id}
                                className={`flex items-center justify-between text-sm px-2 py-1 rounded ${
                                  cp.points >= tier.points_required
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                    : 'text-gray-500'
                                }`}
                              >
                                <span>{tier.points_required}點 → ${tier.reward_value}</span>
                                {cp.points >= tier.points_required && (
                                  <span className="text-xs font-medium">可兌換</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => openAdjustModal(cp)}
                          className="flex-1 text-sm rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          調整點數
                        </button>
                        {cp.points > 0 && cp.program?.tiers?.some(t => cp.points >= t.points_required) && (
                          <button
                            onClick={() => openRedeemModal(cp)}
                            className="flex-1 text-sm rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700"
                          >
                            兌換
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 點數歷史 */}
                <div className="border-t dark:border-gray-700 pt-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <History className="h-5 w-5" />
                    點數變動記錄
                  </h3>
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {pointLogs.length === 0 ? (
                      <div className="py-4 text-center text-gray-500">暫無記錄</div>
                    ) : (
                      pointLogs.slice(0, 20).map((log) => (
                        <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${getChangeTypeColor(log.change_type)}`}>
                                {getChangeTypeLabel(log.change_type)}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {log.program?.name}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {log.note}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">
                              {new Date(log.created_at).toLocaleString('zh-TW')}
                            </div>
                          </div>
                          <div className={`text-lg font-bold ${
                            log.points_change > 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {log.points_change > 0 ? '+' : ''}{log.points_change}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Redeem Modal */}
      {redeemingProgram && pointsCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
              兌換 {redeemingProgram.program?.name} 點數
            </h2>

            <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">當前點數</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {redeemingProgram.points} 點
              </div>
            </div>

            {redeemError && (
              <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-red-700 dark:text-red-200">
                {redeemError}
              </div>
            )}

            <div className="mb-4 space-y-2">
              {redeemingProgram.program?.tiers?.map((tier) => (
                <label
                  key={tier.id}
                  className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${
                    selectedTier === tier.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : redeemingProgram.points >= tier.points_required
                        ? 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="tier"
                      value={tier.id}
                      checked={selectedTier === tier.id}
                      onChange={(e) => setSelectedTier(e.target.value)}
                      disabled={redeemingProgram.points < tier.points_required}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {tier.points_required} 點
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      ${tier.reward_value}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRedeemingProgram(null)}
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleRedeem}
                disabled={!selectedTier || processing}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
              >
                {processing ? '處理中...' : '確認兌換'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Modal */}
      {adjustingPoints && pointsCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6">
            <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
              調整 {adjustingPoints.program?.name} 點數
            </h2>

            <div className="mb-4 rounded-lg bg-gray-50 dark:bg-gray-700 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">當前點數</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {adjustingPoints.points} 點
              </div>
            </div>

            {adjustError && (
              <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-red-700 dark:text-red-200">
                {adjustError}
              </div>
            )}

            <div className="space-y-4 mb-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                  調整點數 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  placeholder="正數增加，負數減少"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">備註</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                  placeholder="選填"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdjustingPoints(null)}
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAdjustPoints}
                disabled={!adjustAmount || processing}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600"
              >
                {processing ? '處理中...' : '確認調整'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
