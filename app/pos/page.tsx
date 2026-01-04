'use client'

import { useState, useEffect, useRef } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { Product, SaleItem, PaymentMethod } from '@/types'

type CartItem = SaleItem & {
  product: Product
}

type Customer = {
  id: string
  customer_code: string
  customer_name: string
  phone: string | null
  is_active: boolean
}

export default function POSPage() {
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [isPaid, setIsPaid] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState(0)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-focus barcode input on mount
    barcodeInputRef.current?.focus()
    // Fetch customers
    fetchCustomers()
  }, [])

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers?active=true')
      const data = await res.json()
      if (data.ok) {
        setCustomers(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err)
    }
  }

  const searchProduct = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      const res = await fetch(`/api/products/search?keyword=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (data.ok) {
        setSearchResults(data.data || [])
      }
    } catch (err) {
      console.error('Search error:', err)
    }
  }

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return

    setError('')
    setSearchResults([])

    try {
      const res = await fetch(`/api/products/search?barcode=${encodeURIComponent(barcode)}`)
      const data = await res.json()

      if (data.ok && data.data) {
        addToCart(data.data)
        setBarcode('')
      } else {
        // Product not found - show quick add modal
        setShowQuickAdd(true)
      }
    } catch (err) {
      setError('搜尋失敗')
    }
  }

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        )
      }
      return [
        ...prev,
        {
          product_id: product.id,
          quantity,
          price: product.price,
          product,
        },
      ]
    })
    setSearchResults([])
    setBarcode('')
    barcodeInputRef.current?.focus()
  }

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, quantity } : item
      )
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product_id !== productId))
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  // Calculate discount
  let discountAmount = 0
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100
  } else if (discountType === 'amount') {
    discountAmount = discountValue
  }

  const total = Math.max(0, subtotal - discountAmount)

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setError('購物車是空的')
      return
    }

    // 如果是散客但未收款，要求先建立客戶
    if (!selectedCustomer && !isPaid) {
      setError('未收款訂單需要選擇客戶，請先建立客戶或選擇已有客戶')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: selectedCustomer?.customer_code || undefined,
          source: 'pos',
          payment_method: paymentMethod,
          is_paid: isPaid,
          note: note || undefined,
          discount_type: discountType,
          discount_value: discountValue,
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
          })),
        }),
      })

      const data = await res.json()

      if (data.ok) {
        // Success - clear cart and reset
        setCart([])
        setSelectedCustomer(null)
        setPaymentMethod('cash')
        setIsPaid(true)
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)
        alert(`銷售完成！單號：${data.data.sale_no}`)
        barcodeInputRef.current?.focus()
      } else {
        setError(data.error || '結帳失敗')
      }
    } catch (err) {
      setError('結帳失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleQuickAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const price = parseFloat(formData.get('price') as string)

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_code: `P${Date.now()}`,
          barcode,
          name,
          price,
          cost: 0,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        addToCart(data.data)
        setShowQuickAdd(false)
        setBarcode('')
      } else {
        setError(data.error || '建檔失敗')
      }
    } catch (err) {
      setError('建檔失敗')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">POS 收銀</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: Barcode search and cart */}
          <div className="lg:col-span-2 space-y-4">
            {/* Barcode input */}
            <div className="rounded-lg bg-white p-6 shadow">
              <form onSubmit={handleBarcodeSubmit}>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  掃描條碼或搜尋商品
                </label>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value)
                    searchProduct(e.target.value)
                  }}
                  placeholder="輸入條碼後按 Enter，或輸入關鍵字搜尋"
                  className="w-full rounded border border-gray-300 px-4 py-3 text-lg text-gray-900 placeholder:text-gray-900 focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </form>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded border border-gray-200 bg-white">
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="w-full border-b border-gray-100 p-3 text-left hover:bg-gray-50"
                    >
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-900">
                        {product.item_code} | 庫存: {product.stock} | {formatCurrency(product.price)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart */}
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">購物車</h2>

              {error && (
                <div className="mb-4 rounded bg-red-50 p-3 text-red-700">
                  {error}
                </div>
              )}

              {cart.length === 0 ? (
                <p className="py-8 text-center text-gray-900">購物車是空的</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center justify-between rounded border border-gray-200 p-3"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.product.name}</div>
                        <div className="text-sm text-gray-900">
                          {formatCurrency(item.price)} × {item.quantity}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.product_id, parseInt(e.target.value) || 0)
                          }
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-gray-900"
                          min="1"
                        />
                        <div className="w-24 text-right font-semibold text-gray-900">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="font-medium text-red-600 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Checkout panel */}
          <div className="space-y-4">
            <div className="rounded-lg bg-white p-6 shadow">
              <h2 className="mb-4 text-xl font-semibold text-gray-900">結帳</h2>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-900">客戶（選填）</label>
                <select
                  value={selectedCustomer?.id || ''}
                  onChange={(e) => {
                    const customer = customers.find(c => c.id === e.target.value)
                    setSelectedCustomer(customer || null)
                  }}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                >
                  <option value="">散客</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.customer_name}
                      {customer.phone ? ` (${customer.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-900">付款方式</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
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

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-900">折扣</label>
                <div className="flex gap-2 mb-2">
                  <select
                    value={discountType}
                    onChange={(e) => {
                      setDiscountType(e.target.value as any)
                      if (e.target.value === 'none') {
                        setDiscountValue(0)
                      }
                    }}
                    className="w-32 rounded border border-gray-300 px-3 py-2 text-gray-900"
                  >
                    <option value="none">無折扣</option>
                    <option value="percent">百分比</option>
                    <option value="amount">固定金額</option>
                  </select>
                  {discountType !== 'none' && (
                    <input
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      min="0"
                      max={discountType === 'percent' ? 100 : subtotal}
                      step={discountType === 'percent' ? 1 : 0.01}
                      className="flex-1 rounded border border-gray-300 px-3 py-2 text-gray-900"
                      placeholder={discountType === 'percent' ? '折扣%' : '折扣金額'}
                    />
                  )}
                </div>
                {discountType !== 'none' && discountAmount > 0 && (
                  <p className="text-sm text-gray-600">
                    折扣金額: -{formatCurrency(discountAmount)}
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-gray-900">已收款</span>
                </label>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-900">備註（選填）</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="輸入備註..."
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder:text-gray-900 resize-none"
                />
              </div>

              <div className="mb-6 border-t border-gray-200 pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-gray-900">
                    <span>小計</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>折扣</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-2xl font-bold border-t border-gray-200 pt-2">
                    <span className="text-gray-900">合計</span>
                    <span className="text-blue-600">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="w-full rounded-lg bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                {loading ? '處理中...' : '確認結帳'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Modal */}
      {showQuickAdd && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="mb-4 text-xl font-semibold text-gray-900">快速建檔商品</h3>
            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">條碼</label>
                <input
                  type="text"
                  value={barcode}
                  disabled
                  className="w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">商品名稱 *</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-900">售價 *</label>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowQuickAdd(false)
                    setBarcode('')
                  }}
                  className="flex-1 rounded border border-gray-300 px-4 py-2 text-gray-900 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  儲存並加入購物車
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
