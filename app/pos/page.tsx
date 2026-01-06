'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { formatCurrency } from '@/lib/utils'
import type { Product, SaleItem, PaymentMethod } from '@/types'

type CartItem = SaleItem & {
  product: Product
  isGift?: boolean
  ichiban_kuji_prize_id?: string
  ichiban_kuji_id?: string
}

type Customer = {
  id: string
  customer_code: string
  customer_name: string
  phone: string | null
  is_active: boolean
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
  price: number
  is_active: boolean
  created_at: string
  combo_prices?: ComboPrice[]
}

type IchibanKujiPrize = {
  id: string
  prize_tier: string
  product_id: string
  quantity: number
  remaining: number
  products: Product
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
  const [discountValue, setDiscountValue] = useState('')
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // 一番賞相關狀態
  const [mode, setMode] = useState<'products' | 'ichiban-kuji'>('products')
  const [ichibanKujis, setIchibanKujis] = useState<IchibanKuji[]>([])
  const [selectedKuji, setSelectedKuji] = useState<IchibanKuji | null>(null)
  const [kujiPrizes, setKujiPrizes] = useState<IchibanKujiPrize[]>([])
  const [comboMode, setComboMode] = useState<ComboPrice | null>(null)
  const [comboDrawsRemaining, setComboDrawsRemaining] = useState(0)

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchIchibanKujis()
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
      const res = await fetch('/api/products?active=true&all=true')
      const data = await res.json()
      if (data.ok) {
        setProducts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
    }
  }

  const fetchIchibanKujis = async () => {
    try {
      const res = await fetch('/api/ichiban-kuji?active=true')
      const data = await res.json()
      if (data.ok) {
        setIchibanKujis(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch ichiban kujis:', err)
    }
  }

  const fetchKujiPrizes = async (kujiId: string) => {
    try {
      const res = await fetch(`/api/ichiban-kuji/${kujiId}`)
      const data = await res.json()
      if (data.ok && data.data.ichiban_kuji_prizes) {
        setKujiPrizes(data.data.ichiban_kuji_prizes || [])
      }
    } catch (err) {
      console.error('Failed to fetch kuji prizes:', err)
    }
  }

  const handleKujiClick = async (kuji: IchibanKuji) => {
    setSelectedKuji(kuji)
    await fetchKujiPrizes(kuji.id)
    setComboMode(null)
    setComboDrawsRemaining(0)
  }

  const handleComboClick = (combo: ComboPrice) => {
    setComboMode(combo)
    setComboDrawsRemaining(combo.draws)
  }

  const exitComboMode = () => {
    setComboMode(null)
    setComboDrawsRemaining(0)
  }

  const handlePrizeClick = (prize: IchibanKujiPrize, kuji: IchibanKuji) => {
    // 檢查一番賞庫的剩餘數量
    if (prize.remaining <= 0) {
      setError(`${prize.prize_tier} 已售完`)
      return
    }

    // 決定使用的價格：組合價平均價或一番賞單價
    const priceToUse = comboMode
      ? comboMode.price / comboMode.draws
      : kuji.price

    // 直接將賞品加入購物車，使用一番賞的價格，並記錄一番賞信息
    setCart((prev) => {
      // 檢查購物車中是否已有相同的一番賞商品（需要同時匹配 product_id 和 prize_id）
      const existingIndex = prev.findIndex(
        (item) => item.product_id === prize.product_id && item.ichiban_kuji_prize_id === prize.id
      )

      if (existingIndex >= 0) {
        // 如果已經存在，增加數量
        return prev.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }

      // 如果不存在，新增項目
      return [
        ...prev,
        {
          product_id: prize.product_id,
          quantity: 1,
          price: priceToUse,
          product: prize.products,
          ichiban_kuji_prize_id: prize.id,
          ichiban_kuji_id: kuji.id,
        },
      ]
    })

    // 如果在組合價模式，減少剩餘抽數
    if (comboMode && comboDrawsRemaining > 0) {
      const newRemaining = comboDrawsRemaining - 1
      setComboDrawsRemaining(newRemaining)

      // 如果組合價已抽完，退出組合價模式
      if (newRemaining === 0) {
        exitComboMode()
        alert(`組合價 ${comboMode.draws} 抽已完成！`)
      }
    }

    setError('')
  }

  const handleBackToKujiList = () => {
    setSelectedKuji(null)
    setKujiPrizes([])
    setComboMode(null)
    setComboDrawsRemaining(0)
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

  const toggleGift = (productId: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product_id === productId ? { ...item, isGift: !item.isGift } : item
      )
    )
  }

  const subtotal = cart.reduce((sum, item) => {
    const price = item.isGift ? 0 : item.price
    return sum + price * item.quantity
  }, 0)

  let discountAmount = 0
  const discountNum = parseFloat(discountValue) || 0
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountNum) / 100
  } else if (discountType === 'amount') {
    discountAmount = discountNum
  }

  const total = subtotal - discountAmount

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
          discount_value: parseFloat(discountValue) || 0,
          items: cart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.isGift ? 0 : item.price,
            // @ts-ignore - 傳遞一番賞信息
            ichiban_kuji_prize_id: item.ichiban_kuji_prize_id,
            ichiban_kuji_id: item.ichiban_kuji_id,
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
        setDiscountValue('')
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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.jpg"
            alt="ToyFlow ERP Logo"
            width={48}
            height={48}
            className="rounded"
          />
          <h1 className="text-2xl font-bold text-black dark:text-white">POS 收銀系統</h1>
        </div>
        <div className="text-sm text-black dark:text-gray-300">{new Date().toLocaleString('zh-TW')}</div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left - Product Grid / Ichiban Kuji */}
        <div className="w-[500px] flex flex-col bg-white dark:bg-gray-800 p-4 overflow-hidden border-r-2 border-gray-300">
          {/* 模式切換按鈕 */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => {
                setMode('products')
                setSelectedKuji(null)
                setKujiPrizes([])
              }}
              className={`flex-1 py-2 px-3 rounded font-bold border-2 transition-all text-sm ${
                mode === 'products'
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-white text-black dark:text-white border-gray-400 dark:border-gray-600 hover:bg-gray-100'
              }`}
            >
              商品庫
            </button>
            <button
              onClick={() => {
                setMode('ichiban-kuji')
                setSelectedKuji(null)
                setKujiPrizes([])
              }}
              className={`flex-1 py-2 px-3 rounded font-bold border-2 transition-all text-sm ${
                mode === 'ichiban-kuji'
                  ? 'bg-purple-500 text-white border-purple-600'
                  : 'bg-white text-black dark:text-white border-gray-400 dark:border-gray-600 hover:bg-gray-100'
              }`}
            >
              一番賞庫
            </button>
          </div>

          {mode === 'products' ? (
            <>
              {/* 商品庫模式 */}
              <div className="mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="掃描條碼或搜尋商品"
                  className="w-full border-2 border-gray-400 rounded px-3 py-2 text-sm text-black dark:text-gray-300 focus:border-black focus:outline-none"
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
            </>
          ) : (
            <>
              {/* 一番賞庫模式 */}
              {!selectedKuji ? (
                <>
                  {/* 一番賞列表 */}
                  <div className="mb-3">
                    <div className="text-sm font-bold text-black dark:text-white">選擇一番賞</div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <div className="space-y-2">
                      {ichibanKujis.map((kuji) => (
                        <button
                          key={kuji.id}
                          onClick={() => handleKujiClick(kuji)}
                          className="w-full bg-purple-500 hover:bg-purple-600 text-white rounded p-4 shadow hover:shadow-md transition-all active:scale-95 text-left border border-purple-600"
                        >
                          <div className="text-lg font-bold mb-2">{kuji.name}</div>
                          <div className="text-sm space-y-1">
                            <div>總抽數: {kuji.total_draws}</div>
                            <div>每抽售價: {formatCurrency(kuji.price)}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* 賞別選擇 */}
                  <div className="mb-3 flex items-center gap-2">
                    <button
                      onClick={handleBackToKujiList}
                      className="bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-black rounded px-3 py-2 text-sm font-bold border border-gray-400"
                    >
                      ← 返回
                    </button>
                    <div className="text-sm font-bold text-black flex-1">{selectedKuji.name}</div>
                  </div>

                  {/* 組合價選擇 */}
                  {selectedKuji.combo_prices && selectedKuji.combo_prices.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-purple-600 mb-1">組合價優惠</div>
                      <div className="grid grid-cols-2 gap-2">
                        {selectedKuji.combo_prices.map((combo, index) => (
                          <button
                            key={index}
                            onClick={() => handleComboClick(combo)}
                            className={`py-2 px-3 rounded font-bold border-2 transition-all text-sm ${
                              comboMode?.draws === combo.draws && comboMode?.price === combo.price
                                ? 'bg-purple-500 text-white border-purple-600'
                                : 'bg-white text-purple-600 border-purple-400 hover:bg-purple-50'
                            }`}
                          >
                            <div className="text-xs">{combo.draws} 抽</div>
                            <div className="font-bold">{formatCurrency(combo.price)}</div>
                            <div className="text-xs opacity-75">
                              平均 {formatCurrency(combo.price / combo.draws)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 組合價模式提示 */}
                  {comboMode && (
                    <div className="mb-3 bg-purple-100 border-2 border-purple-400 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold text-purple-800">
                          組合價模式：還需選擇 {comboDrawsRemaining} 抽
                        </div>
                        <button
                          onClick={exitComboMode}
                          className="text-xs bg-white text-purple-600 px-2 py-1 rounded font-bold border border-purple-400 hover:bg-purple-50"
                        >
                          取消
                        </button>
                      </div>
                      <div className="text-xs text-purple-600 mt-1">
                        每抽價格：{formatCurrency(comboMode.price / comboMode.draws)}
                      </div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-2">
                      {kujiPrizes.map((prize) => (
                        <button
                          key={prize.id}
                          onClick={() => handlePrizeClick(prize, selectedKuji)}
                          disabled={prize.remaining <= 0}
                          className={`rounded p-4 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[120px] border-2 ${
                            prize.remaining > 0
                              ? 'bg-gradient-to-br from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 border-yellow-600 text-black'
                              : 'bg-gray-300 border-gray-400 text-gray-600 cursor-not-allowed'
                          }`}
                        >
                          <div className="text-2xl font-bold mb-2">{prize.prize_tier}</div>
                          <div className="text-sm font-bold text-center mb-1 line-clamp-2">{prize.products.name}</div>
                          <div className="text-sm mt-1">剩餘: {prize.remaining} 抽</div>
                          <div className="text-xs mt-1 opacity-75">總數: {prize.quantity} 抽</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Middle - Cart */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col border-r-2 border-gray-300">
          <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b-2 border-gray-300 dark:border-gray-700">
            <h2 className="font-bold text-lg text-black dark:text-white">購物清單</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
                <div className="text-4xl mb-2">🛒</div>
                <div className="text-black dark:text-white">請點選商品</div>
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product_id}
                  className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex-1">
                      <div className="font-bold text-sm text-black dark:text-white dark:text-gray-300 flex items-center gap-1">
                        {item.product.name}
                        {item.isGift && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">贈品</span>}
                      </div>
                      <div className="text-xs text-gray-600">
                        {item.isGift ? (
                          <span className="line-through">{formatCurrency(item.price)}</span>
                        ) : (
                          formatCurrency(item.price)
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-red-600 hover:text-red-800 font-bold text-lg ml-2"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-white dark:text-gray-300"
                      >
                        −
                      </button>
                      <span className="w-10 text-center font-bold text-sm text-black dark:text-white dark:text-gray-300">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-white dark:text-gray-300"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-base font-bold text-black dark:text-white">
                      {formatCurrency((item.isGift ? 0 : item.price) * item.quantity)}
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.isGift || false}
                        onChange={() => toggleGift(item.product_id)}
                        className="w-4 h-4"
                      />
                      <span className="text-xs text-black dark:text-gray-300 dark:text-white">贈品</span>
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total Display */}
          <div className="bg-white dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg text-black dark:text-white">小計</span>
              <span className="text-2xl font-bold text-black dark:text-white">{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between items-center mb-2 text-red-600">
                <span className="text-lg">折扣</span>
                <span className="text-2xl font-bold">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="border-t-2 border-gray-300 dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-xl text-black dark:text-white">總計</span>
              <span className="text-4xl font-bold text-black dark:text-white">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Right - Payment Panel */}
        <div className="w-[450px] bg-white dark:bg-gray-800 flex flex-col">
          {error && (
            <div className="bg-red-100 border-2 border-red-500 text-red-700 rounded-lg px-3 py-2 m-3 mb-0">
              {error}
            </div>
          )}

          <div className="flex-1 p-3 space-y-2">
            {/* Customer */}
            <div>
              <label className="block font-bold mb-1 text-sm text-black dark:text-gray-300">客戶</label>
              <select
                value={selectedCustomer?.id || ''}
                onChange={(e) => {
                  const customer = customers.find(c => c.id === e.target.value)
                  setSelectedCustomer(customer || null)
                }}
                className="w-full border-2 border-gray-400 rounded px-2 py-1.5 text-sm text-black dark:text-gray-300 focus:border-black focus:outline-none"
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
              <label className="block font-bold mb-1 text-sm text-black dark:text-gray-300">付款方式</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'cash'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  💵 現金
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'card'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  💳 刷卡
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_cathay')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'transfer_cathay'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🏦 國泰
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_fubon')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'transfer_fubon'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🏦 富邦
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_esun')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'transfer_esun'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🏦 玉山
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_union')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'transfer_union'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🏦 聯邦
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer_linepay')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'transfer_linepay'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  💚 LINE Pay
                </button>
                <button
                  onClick={() => setPaymentMethod('cod')}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'cod'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📦 貨到付款
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('pending')
                    setIsPaid(false)
                  }}
                  className={`py-2 px-2 rounded font-bold border-2 transition-all text-sm text-black dark:text-gray-300 ${
                    paymentMethod === 'pending'
                      ? 'bg-orange-400 border-orange-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  ⏳ 待確定
                </button>
              </div>
            </div>

            {/* Discount - Button Selection */}
            <div>
              <label className="block font-bold mb-1 text-sm text-black dark:text-gray-300">折扣</label>
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                <button
                  onClick={() => {
                    setDiscountType('none')
                    setDiscountValue('')
                  }}
                  className={`py-1.5 rounded font-bold border-2 transition-all text-xs text-black dark:text-gray-300 ${
                    discountType === 'none'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  無折扣
                </button>
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`py-1.5 rounded font-bold border-2 transition-all text-xs text-black dark:text-gray-300 ${
                    discountType === 'percent'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  百分比
                </button>
                <button
                  onClick={() => setDiscountType('amount')}
                  className={`py-1.5 rounded font-bold border-2 transition-all text-xs text-black dark:text-gray-300 ${
                    discountType === 'amount'
                      ? 'bg-yellow-400 border-yellow-500'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 hover:bg-gray-100'
                  }`}
                >
                  金額
                </button>
              </div>
              {discountType !== 'none' && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={discountValue}
                  onChange={(e) => {
                    const v = e.target.value
                    // 只允許空字串或純數字（整數）
                    if (v === '' || /^\d*$/.test(v)) {
                      setDiscountValue(v)
                    }
                  }}
                  className="w-full border-2 border-gray-400 rounded px-2 py-1.5 text-sm text-black dark:text-gray-300 focus:border-black focus:outline-none"
                  placeholder={discountType === 'percent' ? '折扣 %' : '折扣金額'}
                />
              )}
            </div>

            {/* Payment Status */}
            <label className={`flex items-center gap-2 border-2 border-gray-400 rounded px-3 py-2 ${
              paymentMethod === 'pending' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-100'
            }`}>
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                disabled={paymentMethod === 'pending'}
                className="w-5 h-5"
              />
              <span className="font-bold text-sm text-black dark:text-white dark:text-gray-300">已收款</span>
            </label>
          </div>

          {/* Checkout Button - Fixed at bottom */}
          <div className="p-3 border-t-2 border-gray-300 bg-white">
            <button
              onClick={handleCheckout}
              disabled={loading || cart.length === 0}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-black font-bold text-xl py-4 rounded-lg shadow-md transition-all active:scale-95 disabled:cursor-not-allowed border-2 border-green-600 disabled:border-gray-500"
            >
              {loading ? '處理中...' : '結帳'}
            </button>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="w-full mt-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-black font-bold text-sm py-2 rounded transition-all border-2 border-gray-400"
              >
                清空購物車
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
