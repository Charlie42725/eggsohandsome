'use client'

import React, { useState, useEffect } from 'react'
import { formatCurrency, formatDate, formatPaymentMethod } from '@/lib/utils'

type ARAccount = {
  id: string
  partner_code: string
  ref_type: string
  ref_id: string
  ref_no: string
  sale_item_id: string | null
  amount: number
  received_paid: number
  balance: number
  due_date: string
  status: string
  created_at: string
  sale_item?: {
    id: string
    quantity: number
    price: number
    subtotal: number
    snapshot_name: string
    product_id: string
    products: {
      item_code: string
      unit: string
    }
  }
  sales?: {
    id: string
    sale_no: string
    sale_date: string
    payment_method: string
  } | null
}

type CustomerGroup = {
  partner_code: string
  customer_name: string
  accounts: ARAccount[]
  total_balance: number
  unpaid_count: number
}

export default function ARPageV2() {
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [receiptAmount, setReceiptAmount] = useState('')
  const [receiptMethod, setReceiptMethod] = useState('cash')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [currentCustomer, setCurrentCustomer] = useState<string | null>(null)
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null)

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)

      const res = await fetch(`/api/ar?${params}`)
      const data = await res.json()

      if (data.ok) {
        // 按客戶分組
        const groups: { [key: string]: CustomerGroup } = {}

        data.data.forEach((account: any) => {
          const key = account.partner_code

          if (!groups[key]) {
            groups[key] = {
              partner_code: account.partner_code,
              customer_name: account.customers?.customer_name || account.partner_code,
              accounts: [],
              total_balance: 0,
              unpaid_count: 0
            }
          }

          groups[key].accounts.push({
            ...account,
            ref_no: account.sales?.sale_no || account.ref_id
          })

          if (account.status !== 'paid') {
            groups[key].total_balance += account.balance
            groups[key].unpaid_count += 1
          }
        })

        setCustomerGroups(Object.values(groups))
      }
    } catch (err) {
      console.error('Failed to fetch AR:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchAccounts()
  }

  const toggleCustomer = (partnerCode: string) => {
    const newExpanded = new Set(expandedCustomers)
    if (newExpanded.has(partnerCode)) {
      newExpanded.delete(partnerCode)
    } else {
      newExpanded.add(partnerCode)
    }
    setExpandedCustomers(newExpanded)
  }

  const toggleAccount = (accountId: string) => {
    const newSelected = new Set(selectedAccounts)
    if (newSelected.has(accountId)) {
      newSelected.delete(accountId)
    } else {
      newSelected.add(accountId)
    }
    setSelectedAccounts(newSelected)
  }

  const selectAllForCustomer = (partnerCode: string, checked: boolean) => {
    const group = customerGroups.find(g => g.partner_code === partnerCode)
    if (!group) return

    const newSelected = new Set(selectedAccounts)

    group.accounts
      .filter(a => a.status !== 'paid')
      .forEach(account => {
        if (checked) {
          newSelected.add(account.id)
        } else {
          newSelected.delete(account.id)
        }
      })

    setSelectedAccounts(newSelected)
  }

  const openReceiptModal = (partnerCode: string) => {
    setCurrentCustomer(partnerCode)
    setShowReceiptModal(true)
    setError('')
  }

  const getSelectedTotal = () => {
    let total = 0
    customerGroups.forEach(group => {
      group.accounts.forEach(account => {
        if (selectedAccounts.has(account.id)) {
          total += account.balance
        }
      })
    })
    return total
  }

  const handleReceipt = async () => {
    if (selectedAccounts.size === 0) {
      setError('請選擇至少一筆帳款')
      return
    }

    const amount = parseFloat(receiptAmount)
    const selectedTotal = getSelectedTotal()

    if (isNaN(amount) || amount <= 0) {
      setError('請輸入正確的金額')
      return
    }

    if (amount > selectedTotal) {
      setError('收款金額不能超過所選帳款總額')
      return
    }

    setProcessing(true)
    setError('')

    try {
      // 按比例分配金額
      let remaining = amount
      const allocations = Array.from(selectedAccounts).map((accountId, index, arr) => {
        const account = customerGroups
          .flatMap(g => g.accounts)
          .find(a => a.id === accountId)!

        const isLast = index === arr.length - 1
        const allocatedAmount = isLast
          ? remaining
          : Math.min(account.balance, remaining)

        remaining -= allocatedAmount

        return {
          partner_account_id: accountId,
          amount: allocatedAmount
        }
      }).filter(a => a.amount > 0)

      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_code: currentCustomer,
          method: receiptMethod,
          amount,
          allocations
        })
      })

      const data = await res.json()

      if (data.ok) {
        alert('收款成功！')
        setShowReceiptModal(false)
        setSelectedAccounts(new Set())
        setReceiptAmount('')
        setCurrentCustomer(null)
        fetchAccounts()
      } else {
        setError(data.error || '收款失敗')
      }
    } catch (err) {
      setError('收款失敗')
    } finally {
      setProcessing(false)
    }
  }

  const handleUpdatePaymentMethod = async (saleId: string, paymentMethod: string) => {
    setUpdatingPayment(saleId)
    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: paymentMethod })
      })

      const data = await res.json()

      if (data.ok) {
        // Update local state
        setCustomerGroups(prevGroups =>
          prevGroups.map(group => ({
            ...group,
            accounts: group.accounts.map(account =>
              account.sales?.id === saleId && account.sales
                ? { ...account, sales: { ...account.sales, payment_method: paymentMethod } }
                : account
            )
          }))
        )
      } else {
        alert('更新失敗: ' + (data.error || '未知錯誤'))
      }
    } catch (err) {
      alert('更新失敗')
    } finally {
      setUpdatingPayment(null)
    }
  }

  const totalUnpaid = customerGroups.reduce((sum, g) => sum + g.total_balance, 0)
  const totalCustomers = customerGroups.filter(g => g.unpaid_count > 0).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">應收帳款</h1>
        </div>

        {/* Summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-sm text-gray-900 dark:text-gray-100">未收總額</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatCurrency(totalUnpaid)}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{totalCustomers} 位客戶</div>
          </div>

          <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-sm text-gray-900 dark:text-gray-100">已選擇</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(getSelectedTotal())}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{selectedAccounts.size} 筆</div>
          </div>

          <div className="rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
            <div className="text-sm text-gray-900 dark:text-gray-100">單據總數</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {customerGroups.reduce((sum, g) => sum + g.unpaid_count, 0)}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100">筆未收</div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋客戶名稱或代碼"
              className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700 placeholder:text-gray-900 dark:placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              搜尋
            </button>
          </form>
        </div>

        {/* Customer Groups */}
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">載入中...</div>
          ) : customerGroups.length === 0 ? (
            <div className="p-8 text-center text-gray-900 dark:text-gray-100">沒有應收帳款</div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {customerGroups.map((group) => {
                const isExpanded = expandedCustomers.has(group.partner_code)
                const unpaidAccounts = group.accounts.filter(a => a.status !== 'paid')
                const allSelected = unpaidAccounts.length > 0 &&
                  unpaidAccounts.every(a => selectedAccounts.has(a.id))

                return (
                  <div key={group.partner_code}>
                    {/* Customer Header */}
                    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => selectAllForCustomer(group.partner_code, e.target.checked)}
                        disabled={unpaidAccounts.length === 0}
                        className="h-4 w-4"
                        onClick={(e) => e.stopPropagation()}
                      />

                      <div
                        className="flex-1 cursor-pointer dark:text-gray-100"
                        onClick={() => toggleCustomer(group.partner_code)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-gray-100">
                              {group.customer_name}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              ({group.partner_code})
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm text-gray-500 dark:text-gray-400">未收款</div>
                              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {formatCurrency(group.total_balance)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {group.unpaid_count} 筆單據
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const customerSelectedAccounts = unpaidAccounts.filter(a => selectedAccounts.has(a.id))
                          if (customerSelectedAccounts.length > 0) {
                            openReceiptModal(group.partner_code)
                          }
                        }}
                        disabled={unpaidAccounts.filter(a => selectedAccounts.has(a.id)).length === 0}
                        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-300"
                      >
                        收款
                      </button>
                    </div>

                    {/* Account Details */}
                    {isExpanded && (
                      <div className="bg-gray-50 dark:bg-gray-900 px-4 pb-4">
                        <table className="w-full">
                          <thead className="border-b">
                            <tr>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100"></th>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">銷售單號</th>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">商品</th>
                              <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">數量</th>
                              <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">應收金額</th>
                              <th className="pb-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">已收金額</th>
                              <th className="pb-2 pr-4 text-right text-xs font-semibold text-gray-900 dark:text-gray-100">餘額</th>
                              <th className="pb-2 pl-4 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">到期日</th>
                              <th className="pb-2 text-left text-xs font-semibold text-gray-900 dark:text-gray-100">付款方式</th>
                              <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">狀態</th>
                              <th className="pb-2 text-center text-xs font-semibold text-gray-900 dark:text-gray-100">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {group.accounts.map((account) => {
                              const isOverdue = account.status !== 'paid' &&
                                new Date(account.due_date) < new Date()

                              return (
                                <tr key={account.id} className="hover:bg-white dark:hover:bg-gray-800">
                                  <td className="py-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedAccounts.has(account.id)}
                                      onChange={() => toggleAccount(account.id)}
                                      disabled={account.status === 'paid'}
                                      className="h-4 w-4"
                                    />
                                  </td>
                                  <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                    {account.ref_no}
                                  </td>
                                  <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                                    {account.sale_item ? (
                                      <div>
                                        <div className="font-medium">{account.sale_item.snapshot_name}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{account.sale_item.products.item_code}</div>
                                      </div>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                    {account.sale_item ? (
                                      `${account.sale_item.quantity} ${account.sale_item.products.unit}`
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                    {formatCurrency(account.amount)}
                                  </td>
                                  <td className="py-2 text-right text-sm text-gray-900 dark:text-gray-100">
                                    {formatCurrency(account.received_paid)}
                                  </td>
                                  <td className="py-2 pr-4 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {formatCurrency(account.balance)}
                                  </td>
                                  <td className={`py-2 pl-4 text-sm ${isOverdue ? 'font-semibold text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                                    {formatDate(account.due_date)}
                                    {isOverdue && ' (逾期)'}
                                  </td>
                                  <td className="py-2 text-sm">
                                    {account.sales ? (
                                      <select
                                        value={account.sales.payment_method}
                                        onChange={(e) => handleUpdatePaymentMethod(account.sales!.id, e.target.value)}
                                        disabled={updatingPayment === account.sales.id}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`text-xs rounded border px-2 py-1 ${
                                          account.sales.payment_method === 'pending'
                                            ? 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                            : 'border-gray-300 bg-white text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                        }`}
                                      >
                                        <option value="cash">現金</option>
                                        <option value="card">刷卡</option>
                                        <option value="transfer_cathay">轉帳 - 國泰</option>
                                        <option value="transfer_fubon">轉帳 - 富邦</option>
                                        <option value="transfer_esun">轉帳 - 玉山</option>
                                        <option value="transfer_union">轉帳 - 聯邦</option>
                                        <option value="transfer_linepay">轉帳 - LINE Pay</option>
                                        <option value="cod">貨到付款</option>
                                        <option value="pending">待確定</option>
                                      </select>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-center">
                                    <span className={`inline-block rounded px-2 py-1 text-xs ${
                                      account.status === 'paid'
                                        ? 'bg-green-100 text-green-800'
                                        : account.status === 'partial'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {account.status === 'paid' ? '已收清' :
                                       account.status === 'partial' ? '部分收款' : '未收'}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center">
                                    <button
                                      onClick={() => {
                                        // 只选中这一笔
                                        setSelectedAccounts(new Set([account.id]))
                                        openReceiptModal(group.partner_code)
                                      }}
                                      disabled={account.status === 'paid'}
                                      className="rounded bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                                    >
                                      收款
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-6">
            <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">收款</h3>

            {error && (
              <div className="mb-4 rounded bg-red-50 dark:bg-red-900 p-3 text-red-700 dark:text-red-200">{error}</div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                已選擇 {selectedAccounts.size} 筆帳款
              </label>
              <div className="rounded bg-gray-50 dark:bg-gray-700 p-3 text-lg font-bold text-gray-900 dark:text-gray-100">
                應收總額: {formatCurrency(getSelectedTotal())}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                收款金額 *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={receiptAmount}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^\d*$/.test(v)) {
                    setReceiptAmount(v)
                  }
                }}
                className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
                placeholder="輸入收款金額"
                autoFocus
              />
              <button
                onClick={() => setReceiptAmount(String(getSelectedTotal()))}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                全額收款
              </button>
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                收款方式
              </label>
              <select
                value={receiptMethod}
                onChange={(e) => setReceiptMethod(e.target.value)}
                className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 dark:bg-gray-700"
              >
                <option value="cash">現金</option>
                <option value="card">刷卡</option>
                <optgroup label="轉帳">
                  <option value="transfer_cathay">轉帳 - 國泰</option>
                  <option value="transfer_fubon">轉帳 - 富邦</option>
                  <option value="transfer_esun">轉帳 - 玉山</option>
                  <option value="transfer_union">轉帳 - 聯邦</option>
                  <option value="transfer_linepay">轉帳 - LINE Pay</option>
                </optgroup>
                <option value="cod">貨到付款</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowReceiptModal(false)
                  setError('')
                  setReceiptAmount('')
                  setCurrentCustomer(null)
                }}
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                取消
              </button>
              <button
                onClick={handleReceipt}
                disabled={processing}
                className="flex-1 rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:bg-gray-300"
              >
                {processing ? '處理中...' : '確認收款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
