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

type SaleDraft = {
  id: string
  customer_code: string | null
  payment_method: PaymentMethod
  is_paid: boolean
  note: string | null
  discount_type: 'none' | 'percent' | 'amount'
  discount_value: number
  items: CartItem[]
  created_at: string
  customers?: { customer_name: string }
}

type TodaySale = {
  id: string
  sale_no: string
  customer_code: string | null
  total: number
  payment_method: PaymentMethod
  is_paid: boolean
  created_at: string
  customers?: { customer_name: string }
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
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState(0)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Draft orders and today's sales
  const [drafts, setDrafts] = useState<SaleDraft[]>([])
  const [todaySales, setTodaySales] = useState<TodaySale[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [showTodaySales, setShowTodaySales] = useState(false)

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchDrafts()
    fetchTodaySales()
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

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?active=true')
      const data = await res.json()
      if (data.ok) {
        setProducts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
    }
  }

  const fetchDrafts = async () => {
    try {
      const res = await fetch('/api/sale-drafts')
      const data = await res.json()
      if (data.ok) {
        setDrafts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch drafts:', err)
    }
  }

  const fetchTodaySales = async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/api/sales?date_from=${today}&date_to=${today}&source=pos`)
      const data = await res.json()
      if (data.ok) {
        setTodaySales(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch today sales:', err)
    }
  }

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [
        ...prev,
        {
          product_id: product.id,
          quantity: 1,
          price: product.price,
          product,
        },
      ]
    })
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

    if (!selectedCustomer && !isPaid) {
      setError('未收款訂單需要選擇客戶')
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
        setCart([])
        setSelectedCustomer(null)
        setPaymentMethod('cash')
        setIsPaid(true)
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)
        fetchTodaySales() // Refresh today's sales
        alert(`銷售完成！單號：${data.data.sale_no}`)
      } else {
        setError(data.error || '結帳失敗')
      }
    } catch (err) {
      setError('結帳失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      setError('購物車是空的')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/sale-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: selectedCustomer?.customer_code || null,
          payment_method: paymentMethod,
          is_paid: isPaid,
          note: note || null,
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
        setCart([])
        setSelectedCustomer(null)
        setPaymentMethod('cash')
        setIsPaid(true)
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)
        fetchDrafts()
        alert('訂單已暫存')
      } else {
        setError(data.error || '暫存失敗')
      }
    } catch (err) {
      setError('暫存失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleLoadDraft = async (draft: SaleDraft) => {
    setLoading(true)
    try {
      // Load product details for each item
      const itemsWithProducts = await Promise.all(
        draft.items.map(async (item: any) => {
          const res = await fetch(`/api/products?active=true`)
          const data = await res.json()
          const product = data.data?.find((p: Product) => p.id === item.product_id)
          return {
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            product: product || { id: item.product_id, name: 'Unknown', price: item.price },
          }
        })
      )

      setCart(itemsWithProducts)
      setSelectedCustomer(
        draft.customer_code
          ? customers.find((c) => c.customer_code === draft.customer_code) || null
          : null
      )
      setPaymentMethod(draft.payment_method)
      setIsPaid(draft.is_paid)
      setNote(draft.note || '')
      setDiscountType(draft.discount_type)
      setDiscountValue(draft.discount_value)
      setShowDrafts(false)

      // Delete the draft
      await fetch(`/api/sale-drafts/${draft.id}`, { method: 'DELETE' })
      fetchDrafts()
    } catch (err) {
      setError('載入失敗')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm('確定要刪除這個暫存訂單嗎？')) return

    try {
      const res = await fetch(`/api/sale-drafts/${draftId}`, { method: 'DELETE' })
      const data = await res.json()

      if (data.ok) {
        fetchDrafts()
        alert('已刪除')
      } else {
        setError(data.error || '刪除失敗')
      }
    } catch (err) {
      setError('刪除失敗')
    }
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-black dark:text-gray-100">POS 收銀系統</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg transition-all relative"
          >
            暫存訂單
            {drafts.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {drafts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowTodaySales(!showTodaySales)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-4 py-2 rounded-lg transition-all"
          >
            今日交易
          </button>
          <div className="text-sm text-black dark:text-gray-300">{new Date().toLocaleString('zh-TW')}</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left - Product Grid */}
        <div className="w-[500px] flex flex-col bg-white dark:bg-gray-800 p-4 overflow-hidden border-r-2 border-gray-300 dark:border-gray-700">
          <div className="mb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="掃描條碼或搜尋商品"
              className="w-full border-2 border-gray-400 dark:border-gray-600 rounded px-3 py-2 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded p-3 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[100px] border border-blue-600"
                >
                  <div className="text-sm font-bold text-center mb-1 line-clamp-2">{product.name}</div>
                  <div className="text-lg font-bold">{formatCurrency(product.price)}</div>
                  <div className="text-xs mt-1">庫存: {product.stock}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Middle - Cart */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col border-r-2 border-gray-300 dark:border-gray-700">
          <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b-2 border-gray-300 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-bold text-lg text-black dark:text-gray-100">購物清單</h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1 rounded text-sm transition-all"
              >
                清空
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
                <div className="text-4xl mb-2">🛒</div>
                <div className="text-black dark:text-gray-300">請點選商品</div>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product_id}
                  className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1">
                      <div className="font-bold text-sm text-black dark:text-gray-100">{item.product.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{formatCurrency(item.price)}</div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-600 hover:text-red-800 font-bold text-lg ml-2"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-gray-100"
                      >
                        −
                      </button>
                      <span className="w-10 text-center font-bold text-sm text-black dark:text-gray-100">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-gray-100"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-base font-bold text-black dark:text-gray-100">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total Display */}
          <div className="bg-white dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg text-black dark:text-gray-300">小計</span>
              <span className="text-2xl font-bold text-black dark:text-gray-100">{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between items-center mb-2 text-red-600 dark:text-red-400">
                <span className="text-lg">折扣</span>
                <span className="text-2xl font-bold">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="border-t-2 border-gray-300 dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-xl text-black dark:text-gray-300">總計</span>
              <span className="text-4xl font-bold text-black dark:text-gray-100">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Right - Payment Panel */}
        <div className="w-[450px] bg-white dark:bg-gray-800 flex flex-col">
          {error && (
            <div className="bg-red-100 dark:bg-red-900 border-2 border-red-500 dark:border-red-600 text-red-700 dark:text-red-200 rounded-lg px-4 py-3 m-4 mb-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Customer */}
            <div>
              <label className="block font-bold mb-2 text-black dark:text-gray-100">客戶</label>
              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const customer = customers.find(c => c.id === e.target.value)
                  setSelectedCustomer(customer || null)
                }}
                className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2 text-base text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
              >
                <option value="">散客</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method - Button Grid */}
            <div>
              <label className="block font-bold mb-2 text-black dark:text-gray-100">付款方式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💵 現金
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'card'
                      ? 'bg-blue-400 border-blue-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💳 刷卡
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_cathay')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'transfer_cathay'
                      ? 'bg-purple-400 border-purple-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 國泰
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_fubon')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'transfer_fubon'
                      ? 'bg-red-400 border-red-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 富邦
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_esun')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'transfer_esun'
                      ? 'bg-green-400 border-green-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 玉山
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_union')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'transfer_union'
                      ? 'bg-orange-400 border-orange-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 聯邦
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_linepay')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'transfer_linepay'
                      ? 'bg-green-400 border-green-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💚 LINE Pay
                </button>
                <button
                  onClick={() => setPaymentMethod('cod')}
                  className={`py-3 px-4 rounded-lg font-bold border-2 transition-all ${
                    paymentMethod === 'cod'
                      ? 'bg-pink-400 border-pink-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  📦 貨到付款
                </button>
              </div>
            </div>

            {/* Discount - Button Selection */}
            <div>
              <label className="block font-bold mb-2 text-black dark:text-gray-100">折扣</label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  onClick={() => {
                    setDiscountType('none')
                    setDiscountValue(0)
                  }}
                  className={`py-2 rounded-lg font-bold border-2 transition-all ${
                    discountType === 'none'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  無折扣
                </button>
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`py-2 rounded-lg font-bold border-2 transition-all ${
                    discountType === 'percent'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  百分比
                </button>
                <button
                  onClick={() => setDiscountType('amount')}
                  className={`py-2 rounded-lg font-bold border-2 transition-all ${
                    discountType === 'amount'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  金額
                </button>
              </div>
              {discountType !== 'none' && (
                <input
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step={discountType === 'percent' ? 1 : 1}
                  className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-4 py-2 text-lg text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                  placeholder={discountType === 'percent' ? '折扣 %' : '折扣金額'}
                />
              )}
            </div>

            {/* Payment Status */}
            <label className="flex items-center gap-3 cursor-pointer border-2 border-gray-400 dark:border-gray-600 rounded-lg px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="w-6 h-6"
              />
              <span className="font-bold text-lg text-black dark:text-gray-100">已收款</span>
            </label>
          </div>

          {/* Checkout Button - Fixed at bottom */}
          <div className="p-4 border-t-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-2">
              <button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-bold text-xl py-4 rounded-lg shadow-md transition-all active:scale-95 disabled:cursor-not-allowed border-2 border-green-600 disabled:border-gray-500 dark:disabled:border-gray-600"
              >
                {loading ? '處理中...' : '結帳'}
              </button>
              {cart.length > 0 && (
                <button
                  onClick={handleSaveDraft}
                  disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-bold text-xl py-4 rounded-lg shadow-md transition-all active:scale-95 disabled:cursor-not-allowed border-2 border-orange-600 disabled:border-gray-500"
                >
                  暫存
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Draft Orders Sidebar */}
      {showDrafts && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowDrafts(false)}>
          <div className="bg-white dark:bg-gray-800 w-[600px] max-h-[80vh] rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-orange-500 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h2 className="text-xl font-bold">暫存訂單</h2>
              <button onClick={() => setShowDrafts(false)} className="text-2xl hover:text-gray-200">×</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {drafts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-10">
                  <div className="text-4xl mb-2">📋</div>
                  <div>目前沒有暫存訂單</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {drafts.map((draft) => {
                    const draftSubtotal = draft.items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
                    let draftDiscountAmount = 0
                    if (draft.discount_type === 'percent') {
                      draftDiscountAmount = (draftSubtotal * draft.discount_value) / 100
                    } else if (draft.discount_type === 'amount') {
                      draftDiscountAmount = draft.discount_value
                    }
                    const draftTotal = Math.max(0, draftSubtotal - draftDiscountAmount)

                    return (
                      <div key={draft.id} className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-bold text-black dark:text-gray-100">
                              {draft.customers?.customer_name || '散客'}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {new Date(draft.created_at).toLocaleString('zh-TW')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-black dark:text-gray-100">{formatCurrency(draftTotal)}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{draft.items.length} 項商品</div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleLoadDraft(draft)}
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition-all"
                          >
                            載入
                          </button>
                          <button
                            onClick={() => handleDeleteDraft(draft.id)}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded-lg transition-all"
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Today's Sales Sidebar */}
      {showTodaySales && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowTodaySales(false)}>
          <div className="bg-white dark:bg-gray-800 w-[600px] max-h-[80vh] rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="bg-blue-500 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h2 className="text-xl font-bold">今日交易</h2>
              <button onClick={() => setShowTodaySales(false)} className="text-2xl hover:text-gray-200">×</button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
              {todaySales.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-10">
                  <div className="text-4xl mb-2">📊</div>
                  <div>今天還沒有交易記錄</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {todaySales.map((sale) => (
                    <div key={sale.id} className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="font-bold text-black dark:text-gray-100">{sale.sale_no}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {sale.customers?.customer_name || '散客'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-500">
                            {new Date(sale.created_at).toLocaleString('zh-TW')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-black dark:text-gray-100">{formatCurrency(sale.total)}</div>
                          <div className={`text-sm ${sale.is_paid ? 'text-green-600' : 'text-red-600'}`}>
                            {sale.is_paid ? '已收款' : '未收款'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
