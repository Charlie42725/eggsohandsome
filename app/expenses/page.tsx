'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'

type Expense = {
  id: number
  date: string
  category: string
  amount: number
  note: string | null
  created_at: string
}

const EXPENSE_CATEGORIES = [
  '運費',
  '薪資支出',
  '租金支出',
  '文具用品',
  '旅費',
  '修繕費',
  '廣告費',
  '保險費',
  '交際費',
  '捐贈',
  '稅費',
  '伙食費',
  '職工福利',
  '傭金支出',
]

export default function ExpensesPage() {
  const router = useRouter()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)

  useEffect(() => {
    fetchExpenses()
  }, [categoryFilter, dateFrom, dateTo])

  const fetchExpenses = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.append('category', categoryFilter)
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)

      const res = await fetch(`/api/expenses?${params}`)
      const data = await res.json()
      if (data.ok) {
        setExpenses(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch expenses:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number, category: string) => {
    if (!confirm(`確定要刪除這筆「${category}」費用嗎？\n\n此操作無法復原。`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('刪除成功！')
        fetchExpenses()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">會計記帳</h1>
          <button
            onClick={() => router.push('/expenses/new')}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            + 新增費用
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                費用類別
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">全部類別</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                起始日期
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                結束日期
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-4 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium text-gray-900 dark:text-gray-100">總支出</span>
            <span className="text-2xl font-bold text-red-600">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">
              <p className="mb-4">尚未記錄任何費用</p>
              <button
                onClick={() => router.push('/expenses/new')}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                新增第一筆費用
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      日期
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      類別
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      金額
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                      備註
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(expense.date)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-block rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-semibold text-red-600">
                        {formatCurrency(expense.amount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                        {expense.note || '-'}
                      </td>
                      <td className="px-6 py-4 text-center text-sm">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => router.push(`/expenses/${expense.id}/edit`)}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => handleDelete(expense.id, expense.category)}
                            disabled={deleting === expense.id}
                            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                          >
                            {deleting === expense.id ? '刪除中...' : '刪除'}
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
