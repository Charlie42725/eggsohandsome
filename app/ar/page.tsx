'use client'

import React, { useState, useEffect } from 'react'
import { formatCurrency, formatDate, formatPaymentMethod } from '@/lib/utils'

type SaleItem = {
  id: string
  product_id: string
  quantity: number
  price: number
  subtotal: number
  snapshot_name: string
  products?: {
    item_code: string
    unit: string
  }
  // For tracking allocation
  received_amount: number
  balance: number
}

type ARAccount = {
  id: string
  partner_code: string
  ref_type: string
  ref_id: string
  ref_no: string
  amount: number
  received_paid: number
  balance: number
  due_date: string
  status: string
  created_at: string
  sales?: {
    id: string
    sale_no: string
    sale_date: string
    payment_method: string
    sale_items: SaleItem[]
  }
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
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  // Selected items: Map<`${accountId}_${itemId}`, { accountId, itemId, amount }>
  const [selectedItems, setSelectedItems] = useState<Map<string, { accountId: string, itemId: string, amount: number }>>(new Map())
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

          // Process sale items with allocation
          const processedAccount = {
            ...account,
            ref_no: account.sales?.sale_no || account.ref_id
          }

          // Calculate allocation for each sale item
          if (account.sales?.sale_items && account.sales.sale_items.length > 0) {
            const items = account.sales.sale_items
            const totalAmount = account.amount
            const receivedPaid = account.received_paid
            const receiptRatio = totalAmount > 0 ? receivedPaid / totalAmount : 0

            processedAccount.sales.sale_items = items.map((item: any) => ({
              ...item,
              received_amount: Math.floor(item.subtotal * receiptRatio),
              balance: item.subtotal - Math.floor(item.subtotal * receiptRatio)
            }))
          }

          groups[key].accounts.push(processedAccount)

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
    const newExpanded = new Set(expandedAccounts)
    if (newExpanded.has(accountId)) {
      newExpanded.delete(accountId)
    } else {
      newExpanded.add(accountId)
    }
    setExpandedAccounts(newExpanded)
  }

  const toggleItem = (accountId: string, itemId: string, amount: number) => {
    const key = `${accountId}_${itemId}`
    const newSelected = new Map(selectedItems)

    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.set(key, { accountId, itemId, amount })
    }
    setSelectedItems(newSelected)
  }

  const selectAllForCustomer = (partnerCode: string, checked: boolean) => {
    const group = customerGroups.find(g => g.partner_code === partnerCode)
    if (!group) return

    const newSelected = new Map(selectedItems)

    group.accounts
      .filter(a => a.status !== 'paid')
      .forEach(account => {
        if (account.sales?.sale_items) {
          account.sales.sale_items.forEach(item => {
            const key = `${account.id}_${item.id}`
            if (checked && item.balance > 0) {
              newSelected.set(key, {
                accountId: account.id,
                itemId: item.id,
                amount: item.balance
              })
            } else {
              newSelected.delete(key)
            }
          })
        }
      })

    setSelectedItems(newSelected)
  }

  const openReceiptModal = (partnerCode: string) => {
    setCurrentCustomer(partnerCode)
    setShowReceiptModal(true)
    setError('')
  }

  const getSelectedTotal = () => {
    let total = 0
    selectedItems.forEach(item => {
      total += item.amount
    })
    return total
  }

  const handleReceipt = async () => {
    if (selectedItems.size === 0) {
      setError('請選擇至少一筆商品')
      return
    }

    const amount = parseFloat(receiptAmount)
    const selectedTotal = getSelectedTotal()

    if (isNaN(amount) || amount <= 0) {
      setError('請輸入正確的金額')
      return
    }

    if (amount > selectedTotal) {
      setError('收款金額不能超過所選商品總額')
      return
    }

    setProcessing(true)
    setError('')

    try {
      // Group selected items by account and calculate allocation per account
      const accountAllocations = new Map<string, number>()

      selectedItems.forEach(item => {
        const currentAmount = accountAllocations.get(item.accountId) || 0
        accountAllocations.set(item.accountId, currentAmount + item.amount)
      })

      // Calculate proportional allocation based on input amount
      let remaining = amount
      const allocations = Array.from(accountAllocations.entries()).map(([accountId, itemTotal], index, arr) => {
        const isLast = index === arr.length - 1
        const allocatedAmount = isLast
          ? remaining
          : Math.floor((itemTotal / selectedTotal) * amount)

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
        setSelectedItems(new Map())
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">應收帳款</h1>
        </div>

        {/* Summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">未收總額</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(totalUnpaid)}
            </div>
            <div className="text-sm text-gray-900">{totalCustomers} 位客戶</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">已選擇</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(getSelectedTotal())}
            </div>
            <div className="text-sm text-gray-900">{selectedItems.size} 個商品</div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow">
            <div className="text-sm text-gray-900">單據總數</div>
            <div className="text-2xl font-bold text-gray-900">
              {customerGroups.reduce((sum, g) => sum + g.unpaid_count, 0)}
            </div>
            <div className="text-sm text-gray-900">筆未收</div>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋客戶名稱或代碼"
              className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 placeholder:text-gray-900"
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
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : customerGroups.length === 0 ? (
            <div className="p-8 text-center text-gray-900">沒有應收帳款</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {customerGroups.map((group) => {
                const isExpanded = expandedCustomers.has(group.partner_code)

                // Count unpaid items
                let unpaidItemCount = 0
                group.accounts.forEach(a => {
                  if (a.status !== 'paid' && a.sales?.sale_items) {
                    unpaidItemCount += a.sales.sale_items.filter(item => item.balance > 0).length
                  }
                })

                // Check if all items are selected
                const allItemKeys: string[] = []
                group.accounts.forEach(a => {
                  if (a.status !== 'paid' && a.sales?.sale_items) {
                    a.sales.sale_items.forEach(item => {
                      if (item.balance > 0) {
                        allItemKeys.push(`${a.id}_${item.id}`)
                      }
                    })
                  }
                })
                const allSelected = allItemKeys.length > 0 &&
                  allItemKeys.every(key => selectedItems.has(key))

                return (
                  <div key={group.partner_code}>
                    {/* Customer Header */}
                    <div className="flex items-center gap-4 p-4 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => selectAllForCustomer(group.partner_code, e.target.checked)}
                        disabled={unpaidItemCount === 0}
                        className="h-4 w-4"
                        onClick={(e) => e.stopPropagation()}
                      />

                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => toggleCustomer(group.partner_code)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {group.customer_name}
                            </span>
                            <span className="text-sm text-gray-500">
                              ({group.partner_code})
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-sm text-gray-500">未收款</div>
                              <div className="text-lg font-bold text-gray-900">
                                {formatCurrency(group.total_balance)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {group.unpaid_count} 筆單據 · {unpaidItemCount} 個商品
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          selectAllForCustomer(group.partner_code, true)
                          openReceiptModal(group.partner_code)
                        }}
                        disabled={group.total_balance === 0}
                        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-300"
                      >
                        收款
                      </button>
                    </div>

                    {/* Account Details with Items */}
                    {isExpanded && (
                      <div className="bg-gray-50 px-4 pb-4">
                        {group.accounts.map((account) => {
                          const isAccountExpanded = expandedAccounts.has(account.id)
                          const isOverdue = account.status !== 'paid' &&
                            new Date(account.due_date) < new Date()

                          return (
                            <div key={account.id} className="mb-4 rounded border border-gray-200 bg-white">
                              {/* Account Header */}
                              <div
                                className="flex cursor-pointer items-center gap-4 p-3 hover:bg-gray-50"
                                onClick={() => toggleAccount(account.id)}
                              >
                                <span className="text-blue-600">
                                  {isAccountExpanded ? '▼' : '▶'}
                                </span>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">
                                      {account.ref_no}
                                    </span>
                                    {account.sales && (
                                      <span className="text-xs text-gray-500">
                                        |
                                      </span>
                                    )}
                                    {account.sales && (
                                      <select
                                        value={account.sales.payment_method}
                                        onChange={(e) => handleUpdatePaymentMethod(account.sales!.id, e.target.value)}
                                        disabled={updatingPayment === account.sales.id}
                                        onClick={(e) => e.stopPropagation()}
                                        className={`text-xs rounded border px-2 py-0.5 ${
                                          account.sales.payment_method === 'pending'
                                            ? 'border-orange-400 bg-orange-50 text-orange-700'
                                            : 'border-gray-300 bg-white text-gray-700'
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
                                    )}
                                    <span className={`text-xs ${isOverdue ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                                      到期: {formatDate(account.due_date)}
                                      {isOverdue && ' (逾期)'}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    應收 {formatCurrency(account.amount)} |
                                    已收 {formatCurrency(account.received_paid)} |
                                    餘額 {formatCurrency(account.balance)}
                                  </div>
                                </div>
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
                              </div>

                              {/* Sale Items */}
                              {isAccountExpanded && account.sales?.sale_items && (
                                <div className="border-t border-gray-200 p-3">
                                  <table className="w-full text-sm">
                                    <thead className="border-b text-xs">
                                      <tr>
                                        <th className="pb-2 text-left"></th>
                                        <th className="pb-2 text-left font-semibold text-gray-700">商品名稱</th>
                                        <th className="pb-2 text-center font-semibold text-gray-700">數量</th>
                                        <th className="pb-2 text-right font-semibold text-gray-700">單價</th>
                                        <th className="pb-2 text-right font-semibold text-gray-700">小計</th>
                                        <th className="pb-2 text-right font-semibold text-gray-700">已收</th>
                                        <th className="pb-2 text-right font-semibold text-gray-700">餘額</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {account.sales.sale_items.map((item) => {
                                        const itemKey = `${account.id}_${item.id}`
                                        const isItemSelected = selectedItems.has(itemKey)

                                        return (
                                          <tr key={item.id} className="border-b last:border-b-0">
                                            <td className="py-2">
                                              <input
                                                type="checkbox"
                                                checked={isItemSelected}
                                                onChange={() => toggleItem(account.id, item.id, item.balance)}
                                                disabled={item.balance === 0}
                                                className="h-4 w-4"
                                                onClick={(e) => e.stopPropagation()}
                                              />
                                            </td>
                                            <td className="py-2 text-gray-900">
                                              {item.snapshot_name}
                                              {item.products && (
                                                <span className="ml-2 text-xs text-gray-500">
                                                  ({item.products.item_code})
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2 text-center text-gray-900">
                                              {item.quantity} {item.products?.unit}
                                            </td>
                                            <td className="py-2 text-right text-gray-900">
                                              {formatCurrency(item.price)}
                                            </td>
                                            <td className="py-2 text-right text-gray-900">
                                              {formatCurrency(item.subtotal)}
                                            </td>
                                            <td className="py-2 text-right text-gray-600">
                                              {formatCurrency(item.received_amount)}
                                            </td>
                                            <td className="py-2 text-right font-semibold text-gray-900">
                                              {formatCurrency(item.balance)}
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
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-6">
            <h3 className="mb-4 text-xl font-semibold text-gray-900">收款</h3>

            {error && (
              <div className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</div>
            )}

            {/* Selected Items List */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-900">
                已選擇 {selectedItems.size} 個商品
              </label>
              <div className="max-h-64 overflow-y-auto rounded border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="p-2 text-left font-semibold text-gray-700">銷售單號</th>
                      <th className="p-2 text-left font-semibold text-gray-700">商品名稱</th>
                      <th className="p-2 text-right font-semibold text-gray-700">數量</th>
                      <th className="p-2 text-right font-semibold text-gray-700">餘額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Array.from(selectedItems.entries()).map(([key, selection]) => {
                      // Find the account and item details
                      let accountNo = ''
                      let itemName = ''
                      let itemQty = 0
                      let itemUnit = ''
                      let itemBalance = selection.amount

                      customerGroups.forEach(group => {
                        group.accounts.forEach(account => {
                          if (account.id === selection.accountId && account.sales?.sale_items) {
                            accountNo = account.ref_no
                            const item = account.sales.sale_items.find(i => i.id === selection.itemId)
                            if (item) {
                              itemName = item.snapshot_name
                              itemQty = item.quantity
                              itemUnit = item.products?.unit || ''
                            }
                          }
                        })
                      })

                      return (
                        <tr key={key}>
                          <td className="p-2 text-gray-900">{accountNo}</td>
                          <td className="p-2 text-gray-900">{itemName}</td>
                          <td className="p-2 text-right text-gray-900">
                            {itemQty} {itemUnit}
                          </td>
                          <td className="p-2 text-right font-semibold text-gray-900">
                            {formatCurrency(itemBalance)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td colSpan={3} className="p-2 text-right font-semibold text-gray-900">
                        應收總額:
                      </td>
                      <td className="p-2 text-right text-lg font-bold text-gray-900">
                        {formatCurrency(getSelectedTotal())}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-900">
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
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
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
              <label className="mb-1 block text-sm font-medium text-gray-900">
                收款方式
              </label>
              <select
                value={receiptMethod}
                onChange={(e) => setReceiptMethod(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
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
                className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50"
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
