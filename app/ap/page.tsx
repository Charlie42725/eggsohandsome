'use client'

import { useState, useEffect } from 'react'
import { formatCurrency, formatDate } from '@/lib/utils'

type APAccount = {
  id: string
  partner_code: string
  ref_type: string
  ref_id: string
  amount: number
  received_paid: number
  balance: number
  due_date: string
  status: string
  created_at: string
}

export default function APPage() {
  const [accounts, setAccounts] = useState<APAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'cod'>('transfer')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ap')
      const data = await res.json()
      if (data.ok) {
        setAccounts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch AP:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const toggleAccount = (id: string) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const selectedTotal = accounts
    .filter((a) => selectedAccounts.includes(a.id))
    .reduce((sum, a) => sum + a.balance, 0)

  const handlePayment = async () => {
    if (selectedAccounts.length === 0) {
      setError('請選擇至少一筆帳款')
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setError('請輸入正確的金額')
      return
    }

    if (amount > selectedTotal) {
      setError('付款金額不能超過所選帳款總額')
      return
    }

    setProcessing(true)
    setError('')

    try {
      // Get partner_code from first selected account
      const firstAccount = accounts.find((a) => a.id === selectedAccounts[0])
      if (!firstAccount) {
        setError('找不到帳款資料')
        return
      }

      // Allocate amount proportionally
      let remaining = amount
      const allocations = selectedAccounts.map((accountId, index) => {
        const account = accounts.find((a) => a.id === accountId)!
        const isLast = index === selectedAccounts.length - 1

        let allocatedAmount
        if (isLast) {
          allocatedAmount = remaining
        } else {
          allocatedAmount = Math.min(account.balance, remaining)
        }

        remaining -= allocatedAmount

        return {
          partner_account_id: accountId,
          amount: allocatedAmount,
        }
      }).filter((a) => a.amount > 0)

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_code: firstAccount.partner_code,
          method: paymentMethod,
          amount,
          allocations,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        alert('付款成功！')
        setShowPaymentModal(false)
        setSelectedAccounts([])
        setPaymentAmount('')
        fetchAccounts()
      } else {
        setError(data.error || '付款失敗')
      }
    } catch (err) {
      setError('付款失敗')
    } finally {
      setProcessing(false)
    }
  }

  const unpaidAccounts = accounts.filter((a) => a.status === 'unpaid')
  const partialAccounts = accounts.filter((a) => a.status === 'partial')
  const overdueAccounts = accounts.filter(
    (a) =>
      a.status !== 'paid' &&
      new Date(a.due_date) < new Date()
  )

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">應付帳款</h1>
          <button
            onClick={() => setShowPaymentModal(true)}
            disabled={selectedAccounts.length === 0}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            付款 {selectedAccounts.length > 0 && `(${selectedAccounts.length})`}
          </button>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">未付總額</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(unpaidAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
            <div className="text-sm text-gray-900">{unpaidAccounts.length} 筆</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">部分付款</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(partialAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
            <div className="text-sm text-gray-900">{partialAccounts.length} 筆</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-red-600">逾期未付</div>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(overdueAccounts.reduce((sum, a) => sum + a.balance, 0))}
            </div>
            <div className="text-sm text-red-600">{overdueAccounts.length} 筆</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">已選擇</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(selectedTotal)}
            </div>
            <div className="text-sm text-gray-900">{selectedAccounts.length} 筆</div>
          </div>
        </div>

        {/* Accounts table */}
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : accounts.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有應付帳款</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAccounts(
                              accounts
                                .filter((a) => a.status !== 'paid')
                                .map((a) => a.id)
                            )
                          } else {
                            setSelectedAccounts([])
                          }
                        }}
                        checked={
                          selectedAccounts.length > 0 &&
                          selectedAccounts.length ===
                            accounts.filter((a) => a.status !== 'paid').length
                        }
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      廠商代碼
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      單據類型
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      應付金額
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      已付金額
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      餘額
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      到期日
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                      狀態
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {accounts.map((account) => {
                    const isOverdue =
                      account.status !== 'paid' &&
                      new Date(account.due_date) < new Date()

                    return (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedAccounts.includes(account.id)}
                            onChange={() => toggleAccount(account.id)}
                            disabled={account.status === 'paid'}
                          />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {account.partner_code}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {account.ref_type === 'purchase' ? '進貨' : account.ref_type}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(account.amount)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {formatCurrency(account.received_paid)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(account.balance)}
                        </td>
                        <td
                          className={`px-6 py-4 text-sm ${
                            isOverdue ? 'font-semibold text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {formatDate(account.due_date)}
                          {isOverdue && ' (逾期)'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs ${
                              account.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : account.status === 'partial'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {account.status === 'paid'
                              ? '已付清'
                              : account.status === 'partial'
                              ? '部分付款'
                              : '未付'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-xl font-semibold text-gray-900">付款</h3>

            {error && (
              <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900">
                已選擇 {selectedAccounts.length} 筆帳款
              </label>
              <div className="rounded bg-gray-50 p-3 text-lg font-bold text-gray-900">
                應付總額: {formatCurrency(selectedTotal)}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900">
                付款金額 *
              </label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="0"
                step="0.01"
                max={selectedTotal}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                placeholder="輸入付款金額"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-gray-900">
                付款方式
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
              >
                <option value="cash">現金</option>
                <option value="card">刷卡</option>
                <option value="transfer">轉帳</option>
                <option value="cod">貨到付款</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setError('')
                  setPaymentAmount('')
                }}
                className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handlePayment}
                disabled={processing}
                className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                {processing ? '處理中...' : '確認付款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
