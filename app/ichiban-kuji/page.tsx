'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'

type Product = {
  id: string
  name: string
  item_code: string
  cost: number
  unit: string
}

type Prize = {
  id: string
  prize_tier: string
  product_id: string
  quantity: number
  remaining: number
  products: Product
}

type ComboPrice = {
  draws: number
  price: number
}

type IchibanKuji = {
  id: string
  name: string
  total_draws: number
  avg_cost: number
  price?: number
  is_active: boolean
  created_at: string
  combo_prices?: ComboPrice[]
  ichiban_kuji_prizes: Prize[]
}

export default function IchibanKujiPage() {
  const router = useRouter()
  const [kujis, setKujis] = useState<IchibanKuji[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchKujis()
  }, [])

  const fetchKujis = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ichiban-kuji')
      const data = await res.json()
      if (data.ok) {
        setKujis(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch ichiban kuji:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`確定要刪除一番賞「${name}」嗎？\n\n此操作無法復原。`)) {
      return
    }

    setDeleting(id)
    try {
      const res = await fetch(`/api/ichiban-kuji/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.ok) {
        alert('刪除成功！')
        fetchKujis()
      } else {
        alert(`刪除失敗：${data.error}`)
      }
    } catch (err) {
      alert('刪除失敗')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">一番賞管理</h1>
          <button
            onClick={() => router.push('/ichiban-kuji/new')}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            + 新增一番賞
          </button>
        </div>

        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="p-8 text-center text-gray-900">載入中...</div>
          ) : kujis.length === 0 ? (
            <div className="p-8 text-center text-gray-900">
              <p className="mb-4">尚未建立任何一番賞</p>
              <button
                onClick={() => router.push('/ichiban-kuji/new')}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                建立第一個一番賞
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">名稱</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">總抽數</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">賞項數</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">平均成本/抽</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">售價/抽</th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">利潤/抽</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">狀態</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">建立時間</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {kujis.map((kuji) => (
                    <React.Fragment key={kuji.id}>
                      <tr
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => toggleRow(kuji.id)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600">
                              {expandedRows.has(kuji.id) ? '▼' : '▶'}
                            </span>
                            {kuji.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-gray-900">
                          {kuji.total_draws}
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-gray-900">
                          {kuji.ichiban_kuji_prizes?.length || 0}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(kuji.avg_cost)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-green-600">
                          {formatCurrency(kuji.price || 0)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-bold">
                          <span className={(kuji.price || 0) > kuji.avg_cost ? 'text-green-600' : 'text-red-600'}>
                            {formatCurrency((kuji.price || 0) - kuji.avg_cost)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs ${
                              kuji.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {kuji.is_active ? '啟用' : '停用'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDate(kuji.created_at)}
                        </td>
                        <td className="px-6 py-4 text-center text-sm" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => router.push(`/ichiban-kuji/${kuji.id}/edit`)}
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              編輯
                            </button>
                            <button
                              onClick={() => handleDelete(kuji.id, kuji.name)}
                              disabled={deleting === kuji.id}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                              {deleting === kuji.id ? '刪除中...' : '刪除'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedRows.has(kuji.id) && kuji.ichiban_kuji_prizes && (
                        <tr key={`${kuji.id}-details`}>
                          <td colSpan={9} className="bg-gray-50 px-6 py-4">
                            <div className="space-y-4">
                              {/* 組合價資訊 */}
                              {kuji.combo_prices && kuji.combo_prices.length > 0 && (
                                <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                                  <h4 className="mb-2 font-semibold text-gray-900">組合價優惠</h4>
                                  <div className="flex flex-wrap gap-3">
                                    {kuji.combo_prices.map((combo, index) => (
                                      <div key={index} className="rounded bg-white px-3 py-2 shadow-sm border border-purple-200">
                                        <span className="font-semibold text-purple-600">{combo.draws} 抽</span>
                                        <span className="mx-2 text-gray-500">→</span>
                                        <span className="font-semibold text-gray-900">{formatCurrency(combo.price)}</span>
                                        <span className="ml-2 text-xs text-gray-500">
                                          (平均 {formatCurrency(combo.price / combo.draws)}/抽)
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 賞項明細 */}
                              <div className="rounded-lg border border-gray-200 bg-white p-4">
                                <h4 className="mb-3 font-semibold text-gray-900">賞項明細</h4>
                              <table className="w-full">
                                <thead className="border-b">
                                  <tr>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">賞別</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">商品名稱</th>
                                    <th className="pb-2 text-left text-xs font-semibold text-gray-900">品號</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">總數</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">剩餘</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">單位成本</th>
                                    <th className="pb-2 text-right text-xs font-semibold text-gray-900">小計</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {kuji.ichiban_kuji_prizes.map((prize) => (
                                    <tr key={prize.id}>
                                      <td className="py-2 text-sm font-semibold text-gray-900">
                                        {prize.prize_tier}
                                      </td>
                                      <td className="py-2 text-sm text-gray-900">
                                        {prize.products.name}
                                      </td>
                                      <td className="py-2 text-sm text-gray-500">
                                        {prize.products.item_code}
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {prize.quantity} {prize.products.unit}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold">
                                        <span className={prize.remaining > 0 ? 'text-green-600' : 'text-red-600'}>
                                          {prize.remaining} 抽
                                        </span>
                                      </td>
                                      <td className="py-2 text-right text-sm text-gray-900">
                                        {formatCurrency(prize.products.cost)}
                                      </td>
                                      <td className="py-2 text-right text-sm font-semibold text-gray-900">
                                        {formatCurrency(prize.products.cost * prize.quantity)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot className="border-t bg-gray-50">
                                  <tr>
                                    <td colSpan={6} className="py-2 text-right text-sm font-semibold text-gray-900">
                                      總成本:
                                    </td>
                                    <td className="py-2 text-right text-sm font-bold text-gray-900">
                                      {formatCurrency(
                                        kuji.ichiban_kuji_prizes.reduce(
                                          (sum, prize) => sum + prize.products.cost * prize.quantity,
                                          0
                                        )
                                      )}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
