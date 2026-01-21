'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import type { Product, SaleItem, Account } from '@/types'

const CameraScanner = dynamic(() => import('@/components/CameraScanner'), { ssr: false })

type CartItem = SaleItem & {
  product: Product
  ichiban_kuji_prize_id?: string
  ichiban_kuji_id?: string
  isFreeGift?: boolean
}

type Customer = {
  id: string
  customer_code: string
  customer_name: string
  phone: string | null
  is_active: boolean
  store_credit: number
  credit_limit: number
}

interface MobilePOSProps {
  salesMode: 'pos' | 'live'
}

export default function MobilePOS({ salesMode }: MobilePOSProps) {
  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isPaid, setIsPaid] = useState(true)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'amount'>('none')
  const [discountValue, setDiscountValue] = useState(0)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Camera scanner
  const [showCameraScanner, setShowCameraScanner] = useState(false)

  // UI State
  const [activeTab, setActiveTab] = useState<'products' | 'cart'>('products')
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')

  // Success toast
  const [successToast, setSuccessToast] = useState<{
    show: boolean
    saleNo: string
    total: number
  } | null>(null)

  // 點數計劃
  const [pointPrograms, setPointPrograms] = useState<any[]>([])
  const [selectedPointProgram, setSelectedPointProgram] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchPointPrograms()
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?active_only=true')
      const data = await res.json()
      if (data.ok) {
        setAccounts(data.data || [])
        // 預設選擇第一個現金帳戶
        const cashAccount = (data.data || []).find((a: Account) => a.account_type === 'cash')
        if (cashAccount) {
          setSelectedAccountId(cashAccount.id)
        } else if (data.data?.length > 0) {
          setSelectedAccountId(data.data[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err)
    }
  }

  const fetchPointPrograms = async () => {
    try {
      const res = await fetch('/api/point-programs')
      const data = await res.json()
      if (data.ok) {
        const activePrograms = (data.data || []).filter((p: any) => p.is_active)
        setPointPrograms(activePrograms)
        // 自動選擇第一個啟用的點數計劃
        if (activePrograms.length > 0 && !selectedPointProgram) {
          setSelectedPointProgram(activePrograms[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch point programs:', err)
    }
  }

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

  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id && !item.ichiban_kuji_prize_id)
      if (existing) {
        return prev.map((item) =>
          item.product_id === product.id && !item.ichiban_kuji_prize_id
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
          isFreeGift: false,
        },
      ]
    })
    // Switch to cart tab after adding
    setActiveTab('cart')
  }

  const updateCartItemQuantity = (index: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(index)
      return
    }
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: newQuantity } : item))
    )
  }

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  const clearCart = () => {
    if (cart.length > 0 && confirm('確定要清空購物車嗎？')) {
      setCart([])
    }
  }

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  let discountAmount = 0
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100
  } else if (discountType === 'amount') {
    discountAmount = discountValue
  }
  const total = Math.max(0, subtotal - discountAmount)

  // Handle camera scan
  const handleCameraScan = (code: string) => {
    const product = products.find(p => p.barcode === code || p.item_code === code)
    if (product) {
      addToCart(product, 1)
      setSearchQuery('')
    } else {
      setSearchQuery(code)
      setActiveTab('products')
    }
    setShowCameraScanner(false)
  }

  // Handle barcode input
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return

    const product = products.find(p => p.barcode === barcode || p.item_code === barcode)
    if (product) {
      addToCart(product, 1)
      setBarcode('')
    } else {
      setError('找不到商品')
      setTimeout(() => setError(''), 2000)
    }
  }

  // Checkout
  const handleCheckout = async () => {
    if (loading) return
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
      // 獲取選中帳戶的名稱作為 payment_method（向後兼容）
      const selectedAccount = accounts.find(a => a.id === selectedAccountId)
      const paymentMethodName = selectedAccount?.account_name || 'cash'

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: selectedCustomer?.customer_code || undefined,
          source: salesMode,
          payment_method: paymentMethodName,
          account_id: selectedAccountId,
          is_paid: isPaid,
          is_delivered: true,
          note: note || undefined,
          discount_type: discountType,
          discount_value: discountValue,
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            ichiban_kuji_prize_id: item.ichiban_kuji_prize_id,
            ichiban_kuji_id: item.ichiban_kuji_id,
          })),
          // 點數計劃（有選擇客戶時才傳送）
          point_program_id: selectedCustomer && selectedPointProgram ? selectedPointProgram : undefined,
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setCart([])
        setSelectedCustomer(null)
        setCustomerSearchQuery('')
        // 重置為預設帳戶（第一個現金帳戶）
        const defaultCashAccount = accounts.find(a => a.account_type === 'cash')
        setSelectedAccountId(defaultCashAccount?.id || accounts[0]?.id || null)
        setIsPaid(true)
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)

        setSuccessToast({
          show: true,
          saleNo: data.data.sale_no,
          total: total,
        })
        setTimeout(() => setSuccessToast(null), 3000)
      } else {
        setError(data.error || '結帳失敗')
      }
    } catch (err) {
      setError('結帳失敗')
    } finally {
      setLoading(false)
    }
  }

  // Filter products
  const filteredProducts = products
    .filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery)
    )
    .slice(0, 50)

  // Filter customers
  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.customer_code.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.phone?.includes(customerSearchQuery)
  )

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-800 dark:to-blue-900 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">
            {salesMode === 'pos' ? '🏪 店裡收銀' : '📱 直播收銀'}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCameraScanner(true)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              📷
            </button>
          </div>
        </div>

        {/* Barcode Input */}
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="掃描或輸入條碼..."
            className="flex-1 px-3 py-2 rounded-lg bg-white/20 placeholder-white/60 text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors font-medium"
          >
            加入
          </button>
        </form>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 py-3 text-center font-medium transition-colors ${
            activeTab === 'products'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          商品
        </button>
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex-1 py-3 text-center font-medium transition-colors relative ${
            activeTab === 'cart'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          購物車
          {cart.length > 0 && (
            <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pb-32">
        {activeTab === 'products' ? (
          <div className="p-4">
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋商品名稱或編號..."
              className="w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Product Grid */}
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product, 1)}
                  className="bg-white dark:bg-gray-800 rounded-xl p-3 text-left shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow active:scale-95"
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 mb-1">
                    {product.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {product.item_code}
                  </div>
                  <div className="text-blue-600 dark:text-blue-400 font-bold">
                    {formatCurrency(product.price)}
                  </div>
                  {product.stock !== undefined && product.stock <= 5 && (
                    <div className="text-xs text-orange-500 mt-1">
                      庫存: {product.stock}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                找不到商品
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* Customer Selection */}
            <button
              onClick={() => setShowCustomerModal(true)}
              className="w-full mb-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-left flex items-center justify-between"
            >
              <span className="text-gray-900 dark:text-white">
                {selectedCustomer ? `👤 ${selectedCustomer.customer_name}` : '選擇客戶（可選）'}
              </span>
              <span className="text-gray-400">→</span>
            </button>

            {/* Cart Items */}
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                <div className="text-4xl mb-2">🛒</div>
                購物車是空的
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {item.product.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {formatCurrency(item.price)} / {item.product.unit || '件'}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(index)}
                        className="text-red-500 hover:text-red-600 p-1"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                          className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(item.price * item.quantity)}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Clear Cart Button */}
                <button
                  onClick={clearCart}
                  className="w-full py-2 text-red-500 dark:text-red-400 text-sm font-medium"
                >
                  清空購物車
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg">
        {/* Payment Options - Dynamic from Accounts */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
          {accounts.map((account) => {
            const icon = account.account_type === 'cash' ? '💵' : account.account_type === 'bank' ? '🏦' : '💰'
            return (
              <button
                key={account.id}
                onClick={() => {
                  setSelectedAccountId(account.id)
                  // 現金帳戶預設已付款，其他帳戶預設未付款
                  setIsPaid(account.account_type === 'cash')
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedAccountId === account.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {icon} {account.account_name}
              </button>
            )
          })}
          {/* 待定選項 */}
          <button
            onClick={() => {
              setSelectedAccountId(null)
              setIsPaid(false)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              selectedAccountId === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            ❓ 待定
          </button>
        </div>

        {/* Total and Checkout */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 dark:text-gray-400">總計</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(total)}
            </div>
          </div>
          <button
            onClick={handleCheckout}
            disabled={loading || cart.length === 0}
            className="px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? '處理中...' : '結帳'}
          </button>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      <CameraScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onScan={handleCameraScan}
      />

      {/* Customer Selection Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">選擇客戶</h3>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4">
              <input
                type="text"
                value={customerSearchQuery}
                onChange={(e) => setCustomerSearchQuery(e.target.value)}
                placeholder="搜尋客戶..."
                className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border-0 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex-1 overflow-auto px-4 pb-4">
              <button
                onClick={() => {
                  setSelectedCustomer(null)
                  setShowCustomerModal(false)
                }}
                className="w-full mb-2 px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-xl text-left text-gray-700 dark:text-gray-300"
              >
                不選擇客戶（散客）
              </button>

              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer)
                    setShowCustomerModal(false)
                  }}
                  className={`w-full mb-2 px-4 py-3 rounded-xl text-left transition-colors ${
                    selectedCustomer?.id === customer.id
                      ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-500'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-white">
                    {customer.customer_name}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {customer.customer_code} {customer.phone && `· ${customer.phone}`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-20 left-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg text-center">
          {error}
        </div>
      )}

      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-20 left-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg text-center">
          <div className="font-bold">✅ 結帳成功！</div>
          <div className="text-sm">單號: {successToast.saleNo}</div>
          <div className="text-sm">金額: {formatCurrency(successToast.total)}</div>
        </div>
      )}
    </div>
  )
}
