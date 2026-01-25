'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { formatCurrency } from '@/lib/utils'
import type { Product, SaleItem, Account } from '@/types'

const MobilePOS = dynamic(() => import('@/components/MobilePOS'), { ssr: false })

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
  store_credit: number  // 购物金余额
  credit_limit: number  // 信用额度
}

type SaleDraft = {
  id: string
  customer_code: string | null
  payment_method: string
  account_id: string | null
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
  payment_method: string
  account_id: string | null
  is_paid: boolean
  created_at: string
  customers?: { customer_name: string }
}

export default function POSPage() {
  // Mobile detection
  const [isMobile, setIsMobile] = useState(false)
  const [isCheckingMobile, setIsCheckingMobile] = useState(true)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    setIsCheckingMobile(false)
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const [barcode, setBarcode] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isPaid, setIsPaid] = useState(true)
  const [isDelivered, setIsDelivered] = useState(true) // 新增：已出貨狀態
  const [deliveryMethod, setDeliveryMethod] = useState('') // 新增：交貨方式
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('') // 新增：預計出貨日
  const [deliveryNote, setDeliveryNote] = useState('') // 新增：出貨備註
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

  // Sales mode - 可切換店裡/直播模式
  const [salesMode, setSalesMode] = useState<'pos' | 'live'>('pos')

  // Pinned products (常用商品固定)
  const [pinnedProductIds, setPinnedProductIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pinnedProducts')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    }
    return new Set()
  })

  // Custom scrollbar styles
  const scrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 10px;
      height: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 5px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 5px;
      transition: background 0.2s ease;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    /* Dark mode scrollbar */
    .dark .custom-scrollbar::-webkit-scrollbar-track {
      background: #2d2d2d;
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #555;
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #888;
    }
  `

  // Draft orders and today's sales
  const [drafts, setDrafts] = useState<SaleDraft[]>([])
  const [todaySales, setTodaySales] = useState<TodaySale[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [showTodaySales, setShowTodaySales] = useState(false)

  // 帳戶排序
  const [showAccountReorder, setShowAccountReorder] = useState(false)
  const [reorderAccounts, setReorderAccounts] = useState<Account[]>([])

  // Quick add customer
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [addingCustomer, setAddingCustomer] = useState(false)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  // Customer search
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerInputRef = useRef<HTMLInputElement>(null)

  // Inventory mode (products or ichiban kuji)
  const [inventoryMode, setInventoryMode] = useState<'products' | 'ichiban'>('products')
  const [ichibanKujis, setIchibanKujis] = useState<any[]>([])
  const [selectedKuji, setSelectedKuji] = useState<any | null>(null)
  const [expandedKujiId, setExpandedKujiId] = useState<string | null>(null)
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Quantity input modal
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [quantityModalProduct, setQuantityModalProduct] = useState<Product | null>(null)
  const [quantityInput, setQuantityInput] = useState('1')
  const quantityInputRef = useRef<HTMLInputElement>(null)

  // Business day closing (日結)
  const [lastClosingTime, setLastClosingTime] = useState<string>('')
  const [closingStats, setClosingStats] = useState<any>(null)
  const [showClosingModal, setShowClosingModal] = useState(false)
  const [closingNote, setClosingNote] = useState('')

  // 收款與找零
  const [receivedAmount, setReceivedAmount] = useState<string>('')

  // 多元付款
  type MultiPayment = { account_id: string; amount: string }
  const [isMultiPayment, setIsMultiPayment] = useState(false)
  const [multiPayments, setMultiPayments] = useState<MultiPayment[]>([])

  // 結帳成功 Toast
  const [successToast, setSuccessToast] = useState<{
    show: boolean
    saleNo: string
    total: number
    received: number
    change: number
  } | null>(null)
  const [closingInProgress, setClosingInProgress] = useState(false)

  // 點數計劃
  const [pointPrograms, setPointPrograms] = useState<any[]>([])
  const [selectedPointProgram, setSelectedPointProgram] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchIchibanKujis()
    fetchDrafts()
    fetchClosingStats() // 先獲取結帳統計，包含 lastClosingTime
    fetchPointPrograms() // 獲取點數計劃
    fetchAccounts() // 獲取帳戶列表
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

  // Save pinned products to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pinnedProducts', JSON.stringify(Array.from(pinnedProductIds)))
    }
  }, [pinnedProductIds])

  // Refetch today's sales and closing stats when sales mode changes
  useEffect(() => {
    fetchClosingStats() // 重新獲取日結統計（會自動獲取今日銷售）
  }, [salesMode])

  // Close customer dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (customerInputRef.current && !customerInputRef.current.contains(event.target as Node)) {
        const dropdown = document.querySelector('.customer-dropdown')
        if (dropdown && !dropdown.contains(event.target as Node)) {
          setShowCustomerDropdown(false)
        }
      }
    }

    if (showCustomerDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomerDropdown])

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

  const fetchProducts = async (forceRefresh = false) => {
    try {
      // 快取機制：5 分鐘內使用 localStorage 快取
      const CACHE_KEY = 'pos_products_cache'
      const CACHE_EXPIRY_KEY = 'pos_products_cache_expiry'
      const CACHE_DURATION = 5 * 60 * 1000 // 5 分鐘

      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY)
        const expiry = localStorage.getItem(CACHE_EXPIRY_KEY)

        if (cached && expiry && Date.now() < parseInt(expiry)) {
          setProducts(JSON.parse(cached))
          return
        }
      }

      const res = await fetch('/api/products?all=true&active=true')
      const data = await res.json()
      if (data.ok) {
        setProducts(data.data || [])
        // 更新快取
        localStorage.setItem(CACHE_KEY, JSON.stringify(data.data || []))
        localStorage.setItem(CACHE_EXPIRY_KEY, String(Date.now() + CACHE_DURATION))
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

  const fetchClosingStats = async () => {
    try {
      console.log('[fetchClosingStats] 開始獲取日結統計，source:', salesMode)
      const res = await fetch(`/api/business-day-closing?source=${salesMode}`)
      const data = await res.json()
      console.log('[fetchClosingStats] API 響應:', data)

      if (data.ok) {
        console.log('[fetchClosingStats] last_closing_time:', data.data.last_closing_time)
        console.log('[fetchClosingStats] current_stats:', data.data.current_stats)

        setLastClosingTime(data.data.last_closing_time)
        setClosingStats(data.data.current_stats)

        // 獲取結帳時間後，再獲取當日銷售
        await fetchTodaySales(data.data.last_closing_time)
      }
    } catch (err) {
      console.error('Failed to fetch closing stats:', err)
    }
  }

  const fetchTodaySales = async (closingTime?: string) => {
    try {
      const timeParam = closingTime || lastClosingTime
      if (!timeParam) {
        console.log('[fetchTodaySales] 沒有 closing time，跳過')
        return
      }

      console.log('[fetchTodaySales] 查詢當日銷售，created_from:', timeParam, 'source:', salesMode)

      // 使用 encodeURIComponent 避免 + 符號被轉換為空格
      const encodedTime = encodeURIComponent(timeParam)
      const res = await fetch(`/api/sales?created_from=${encodedTime}&source=${salesMode}`)
      const data = await res.json()

      if (!data.ok) {
        console.error('[fetchTodaySales] 查詢失敗:', data.error)
      } else {
        console.log('[fetchTodaySales] 返回的銷售記錄:', data.data?.length, '筆')
        setTodaySales(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch today sales:', err)
    }
  }

  const handleClosing = async () => {
    if (!confirm('確定要執行日結嗎？\n\n日結後將結算當日營業額，並開始新的營業日。')) {
      return
    }

    setClosingInProgress(true)
    try {
      console.log('[日結] 開始執行日結，source:', salesMode)
      const res = await fetch('/api/business-day-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: closingNote, source: salesMode }),
      })

      const data = await res.json()
      console.log('[日結] API 響應:', data)

      if (data.ok) {
        console.log('[日結] 日結成功，新的 closing_time:', data.data?.closing_time)
        alert('日結完成！')
        setShowClosingModal(false)
        setClosingNote('')

        // 稍微延遲後重新獲取，確保數據庫已更新
        await new Promise(resolve => setTimeout(resolve, 500))

        // 重新獲取結帳統計
        console.log('[日結] 重新獲取日結統計...')
        await fetchClosingStats()
      } else {
        alert(`日結失敗：${data.error}`)
      }
    } catch (err) {
      console.error('[日結] 錯誤:', err)
      alert('日結失敗')
    } finally {
      setClosingInProgress(false)
    }
  }

  const addToCart = (product: Product, quantityOrInfo: number | { kuji_id: string; prize_id: string } = 1) => {
    // Determine if this is an ichiban kuji item
    const ichibanInfo = typeof quantityOrInfo === 'object' ? quantityOrInfo : undefined
    const quantity = typeof quantityOrInfo === 'number' ? quantityOrInfo : 1

    setCart((prev) => {
      // For ichiban kuji, don't stack quantities
      if (ichibanInfo) {
        return [
          ...prev,
          {
            product_id: product.id,
            quantity,
            price: product.price,
            product,
            ichiban_kuji_id: ichibanInfo.kuji_id,
            ichiban_kuji_prize_id: ichibanInfo.prize_id,
            isFreeGift: false,
          },
        ]
      }

      // For regular products, stack quantities
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
  }

  const openQuantityModal = (product: Product) => {
    setQuantityModalProduct(product)
    setQuantityInput('1')
    setShowQuantityModal(true)
    // Focus input after modal opens
    setTimeout(() => {
      quantityInputRef.current?.focus()
      quantityInputRef.current?.select()
    }, 100)
  }

  const closeQuantityModal = () => {
    setShowQuantityModal(false)
    setQuantityModalProduct(null)
    setQuantityInput('1')
  }

  const handleQuantitySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quantityModalProduct) return

    const qty = parseInt(quantityInput, 10)
    if (isNaN(qty) || qty <= 0) {
      alert('請輸入有效的數量')
      return
    }

    addToCart(quantityModalProduct, qty)
    closeQuantityModal()
  }

  const addIchibanPrize = (kuji: any, prize: any) => {
    if (prize.remaining <= 0) {
      alert('此賞別已售完')
      return
    }

    // Add to cart
    const product: Product = {
      id: prize.product_id,
      item_code: prize.products.item_code,
      name: `【${kuji.name}】${prize.prize_tier} - ${prize.products.name}`,
      unit: prize.products.unit,
      price: kuji.price || 0,
      cost: prize.products.cost || 0,
      stock: prize.remaining,
      avg_cost: 0,
      allow_negative: false,
      is_active: true,
      tags: [],
    }

    addToCart(product, { kuji_id: kuji.id, prize_id: prize.id })
  }

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(productId)
      return
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product_id === productId && !item.ichiban_kuji_prize_id ? { ...item, quantity } : item
      )
    )
  }

  const toggleFreeGift = (index: number) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          const isFreeGift = !item.isFreeGift
          return {
            ...item,
            isFreeGift,
            price: isFreeGift ? 0 : item.product.price,
          }
        }
        return item
      })
    )
  }

  const toggleAllFreeGift = () => {
    // 检查是否所有商品都已是赠品
    const allAreFreeGift = cart.every(item => item.isFreeGift)

    setCart((prev) =>
      prev.map((item) => {
        // 一番赏不能设置为赠品
        if (item.ichiban_kuji_prize_id) {
          return item
        }

        // 如果全部都是赠品，则取消全选；否则全选
        const isFreeGift = !allAreFreeGift
        return {
          ...item,
          isFreeGift,
          price: isFreeGift ? 0 : item.product.price,
        }
      })
    )
  }

  const removeFromCart = (productId: string, index?: number) => {
    setCart((prev) => {
      if (index !== undefined) {
        // Remove specific item at index (for ichiban items)
        return prev.filter((_, i) => i !== index)
      } else {
        // Remove all items with this product_id (for regular products)
        return prev.filter((item) => item.product_id !== productId)
      }
    })
  }

  // Calculate combo price adjustments for ichiban kuji
  const applyComboPrice = () => {
    const ichibanGroups: { [kuji_id: string]: { items: CartItem[], kuji: any } } = {}

    // Group ichiban items by kuji_id
    cart.forEach(item => {
      if (item.ichiban_kuji_id) {
        if (!ichibanGroups[item.ichiban_kuji_id]) {
          const kuji = ichibanKujis.find(k => k.id === item.ichiban_kuji_id)
          ichibanGroups[item.ichiban_kuji_id] = { items: [], kuji }
        }
        ichibanGroups[item.ichiban_kuji_id].items.push(item)
      }
    })

    let adjustedCart = [...cart]

    // Apply combo prices
    Object.keys(ichibanGroups).forEach(kuji_id => {
      const group = ichibanGroups[kuji_id]
      const totalCount = group.items.reduce((sum, item) => sum + item.quantity, 0)
      const comboPrices = (group.kuji?.combo_prices || []).sort((a: any, b: any) => b.draws - a.draws)
      const originalPrice = group.kuji?.price || 0

      if (comboPrices.length === 0) return

      // Greedy algorithm: use largest combo first, then smaller combos, then original price
      let remaining = totalCount
      let totalComboPrice = 0
      let comboDrawsUsed = 0
      const priceBreakdown: { count: number; pricePerItem: number }[] = []

      for (const combo of comboPrices) {
        const sets = Math.floor(remaining / combo.draws)
        if (sets > 0) {
          totalComboPrice += sets * combo.price
          comboDrawsUsed += sets * combo.draws
          remaining -= sets * combo.draws
          // Track price per item for this combo
          priceBreakdown.push({
            count: sets * combo.draws,
            pricePerItem: combo.price / combo.draws
          })
        }
      }

      // Remaining items use original price
      if (remaining > 0) {
        priceBreakdown.push({
          count: remaining,
          pricePerItem: originalPrice
        })
      }

      // Apply prices to items based on their position
      let itemIndex = 0
      adjustedCart = adjustedCart.map(item => {
        if (item.ichiban_kuji_id === kuji_id) {
          // Find which price bracket this item falls into
          let accumulatedCount = 0
          let itemPrice = originalPrice

          for (const bracket of priceBreakdown) {
            if (itemIndex < accumulatedCount + bracket.count) {
              itemPrice = bracket.pricePerItem
              break
            }
            accumulatedCount += bracket.count
          }

          itemIndex += item.quantity
          return { ...item, price: itemPrice }
        }
        return item
      })
    })

    return adjustedCart
  }

  const cartWithComboPrice = applyComboPrice()

  // Group ichiban items by kuji_id for display
  const displayCart: (CartItem & { groupedCount?: number, indices?: number[] })[] = []
  const processedIndices = new Set<number>()

  cartWithComboPrice.forEach((item, index) => {
    if (processedIndices.has(index)) return

    if (item.ichiban_kuji_id) {
      // Find all items with same kuji_id
      const sameKujiIndices: number[] = []
      let totalQuantity = 0
      let totalPrice = 0

      cartWithComboPrice.forEach((otherItem, otherIndex) => {
        if (otherItem.ichiban_kuji_id === item.ichiban_kuji_id && !processedIndices.has(otherIndex)) {
          sameKujiIndices.push(otherIndex)
          totalQuantity += otherItem.quantity
          totalPrice += otherItem.price * otherItem.quantity
          processedIndices.add(otherIndex)
        }
      })

      // Create merged item
      const kuji = ichibanKujis.find(k => k.id === item.ichiban_kuji_id)
      displayCart.push({
        ...item,
        product: {
          ...item.product,
          name: `【${kuji?.name}】組合`
        },
        quantity: totalQuantity,
        price: totalPrice / totalQuantity, // Average price
        groupedCount: sameKujiIndices.length,
        indices: sameKujiIndices
      })
    } else {
      // Regular product - add as is
      displayCart.push({ ...item, indices: [index] })
      processedIndices.add(index)
    }
  })

  const subtotal = cartWithComboPrice.reduce((sum, item) => sum + item.price * item.quantity, 0)

  let discountAmount = 0
  if (discountType === 'percent') {
    discountAmount = (subtotal * discountValue) / 100
  } else if (discountType === 'amount') {
    discountAmount = discountValue
  }

  const total = Math.max(0, subtotal - discountAmount)

  // 判斷選中的帳戶是否為現金帳戶
  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const isCashAccount = selectedAccount?.account_type === 'cash'

  // Get combo price info for display
  const getIchibanComboInfo = (kuji_id: string) => {
    const items = cart.filter(item => item.ichiban_kuji_id === kuji_id)
    const totalCount = items.reduce((sum, item) => sum + item.quantity, 0)
    const kuji = ichibanKujis.find(k => k.id === kuji_id)
    const comboPrices = kuji?.combo_prices || []

    const applicableCombo = comboPrices
      .filter((combo: any) => combo.draws <= totalCount)
      .sort((a: any, b: any) => b.draws - a.draws)[0]

    return { totalCount, applicableCombo, kuji }
  }

  const handleCheckout = async () => {
    // 🔒 防止重複提交
    if (loading) {
      console.warn('Already processing checkout, ignoring duplicate request')
      return
    }

    if (cart.length === 0) {
      setError('購物車是空的')
      return
    }

    if (!selectedCustomer && !isPaid) {
      const shouldAddCustomer = confirm('未收款訂單需要選擇客戶\n\n要建立新客戶嗎？')
      if (shouldAddCustomer) {
        setShowQuickAddCustomer(true)
        return
      } else {
        setError('未收款訂單需要選擇客戶')
        return
      }
    }

    setLoading(true)
    setError('')

    try {
      // Use combo price adjusted cart for checkout
      const checkoutCart = applyComboPrice()

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
          is_delivered: isDelivered,
          delivery_method: !isDelivered ? deliveryMethod : undefined,
          expected_delivery_date: !isDelivered ? expectedDeliveryDate : undefined,
          delivery_note: !isDelivered ? deliveryNote : undefined,
          note: note || undefined,
          discount_type: discountType,
          discount_value: discountValue,
          // 多元付款：傳送 payments 陣列
          payments: isMultiPayment && isPaid
            ? multiPayments
              .filter(p => parseFloat(p.amount) > 0)
              .map(p => {
                const acc = accounts.find(a => a.id === p.account_id)
                return { method: acc?.account_name || '', account_id: p.account_id, amount: parseFloat(p.amount) }
              })
            : undefined,
          items: checkoutCart.map((item) => ({
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
        // 判斷是否為現金帳戶（用於找零計算）
        const isCashAccount = selectedAccount?.account_type === 'cash'
        const received = parseFloat(receivedAmount) || total

        setCart([])
        setSelectedCustomer(null)
        setCustomerSearchQuery('')
        // 重置為預設帳戶（第一個現金帳戶）
        const defaultCashAccount = accounts.find(a => a.account_type === 'cash')
        setSelectedAccountId(defaultCashAccount?.id || accounts[0]?.id || null)
        setIsPaid(true)
        setIsDelivered(true) // 重置為已出貨
        setDeliveryMethod('') // 清空交貨方式
        setExpectedDeliveryDate('') // 清空預計出貨日
        setDeliveryNote('') // 清空出貨備註
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)
        setReceivedAmount('')
        // 重置多元付款
        setIsMultiPayment(false)
        setMultiPayments([])
        fetchTodaySales() // Refresh today's sales
        fetchIchibanKujis() // Refresh ichiban kuji inventory
        fetchCustomers() // Refresh customers to update store credit

        // 顯示成功 Toast（現金帳戶才顯示找零）
        setSuccessToast({
          show: true,
          saleNo: data.data.sale_no,
          total: total,
          received: isCashAccount ? received : total,
          change: isCashAccount ? Math.max(0, received - total) : 0
        })
        // 3秒後自動消失
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

  const handleSaveDraft = async () => {
    if (cart.length === 0) {
      setError('購物車是空的')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Use combo price adjusted cart for saving draft
      const draftCart = applyComboPrice()

      const selectedAccount = accounts.find(a => a.id === selectedAccountId)

      const res = await fetch('/api/sale-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: selectedCustomer?.customer_code || null,
          payment_method: selectedAccount?.account_name || 'cash',
          account_id: selectedAccountId,
          is_paid: isPaid,
          note: note || null,
          discount_type: discountType,
          discount_value: discountValue,
          items: draftCart.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            ichiban_kuji_prize_id: item.ichiban_kuji_prize_id,
            ichiban_kuji_id: item.ichiban_kuji_id,
          })),
        }),
      })

      const data = await res.json()

      if (data.ok) {
        setCart([])
        setSelectedCustomer(null)
        setCustomerSearchQuery('')
        // 重置為預設帳戶
        const defaultCashAccount = accounts.find(a => a.account_type === 'cash')
        setSelectedAccountId(defaultCashAccount?.id || accounts[0]?.id || null)
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
      setCustomerSearchQuery('')
      // 載入帳戶 ID 或依名稱找對應帳戶
      if (draft.account_id) {
        setSelectedAccountId(draft.account_id)
      } else {
        // 向後兼容：依 payment_method 名稱找帳戶
        const matchingAccount = accounts.find(a => a.account_name === draft.payment_method)
        setSelectedAccountId(matchingAccount?.id || accounts[0]?.id || null)
      }
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

  const handleQuickAddCustomer = async () => {
    if (!newCustomerName.trim()) {
      alert('請輸入客戶名稱')
      return
    }

    if (!newCustomerPhone.trim()) {
      alert('請輸入客戶電話')
      return
    }

    setAddingCustomer(true)

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: newCustomerName.trim(),
          phone: newCustomerPhone.trim(),
        }),
      })

      const data = await res.json()

      if (data.ok) {
        // Create customer object immediately
        const newCustomer: Customer = {
          id: data.data.id,
          customer_code: data.data.customer_code,
          customer_name: data.data.customer_name,
          phone: data.data.phone,
          is_active: true,
          store_credit: 0,
          credit_limit: 0,
        }

        // Select the newly created customer
        setSelectedCustomer(newCustomer)
        setCustomerSearchQuery('')

        // Refresh customers list in background
        fetchCustomers()

        // Clear form and close modal
        setNewCustomerName('')
        setNewCustomerPhone('')
        setShowQuickAddCustomer(false)

        alert(`客戶 ${data.data.customer_name} 已建立並自動選擇`)
      } else {
        alert(`建立失敗：${data.error}`)
      }
    } catch (err) {
      alert('建立失敗')
    } finally {
      setAddingCustomer(false)
    }
  }

  // Toggle pin/unpin product
  const togglePinProduct = (productId: string) => {
    setPinnedProductIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(productId)) {
        newSet.delete(productId)
      } else {
        newSet.add(productId)
      }
      // Save to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('pinnedProducts', JSON.stringify(Array.from(newSet)))
      }
      return newSet
    })
  }

  const filteredProducts = products
    .filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aIsPinned = pinnedProductIds.has(a.id)
      const bIsPinned = pinnedProductIds.has(b.id)
      if (aIsPinned && !bIsPinned) return -1
      if (!aIsPinned && bIsPinned) return 1
      return 0
    })

  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.customer_code.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.phone?.toLowerCase().includes(customerSearchQuery.toLowerCase())
  )

  // Mobile version - render MobilePOS for screens < 1024px
  if (isCheckingMobile) {
    return null // Prevent hydration mismatch
  }

  if (isMobile) {
    return <MobilePOS salesMode="pos" />
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
      <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
        {/* Header - 簡化配色 */}
        <div className={`border-b border-slate-700 px-6 py-3 flex items-center justify-between ${salesMode === 'live'
          ? 'bg-purple-900'
          : 'bg-slate-800'
          }`}>
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">
              🏪 收銀系統
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDrafts(!showDrafts)}
              className="font-medium px-3 py-2 rounded-lg transition-all relative bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
            >
              暫存
              {drafts.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {drafts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowTodaySales(!showTodaySales)}
              className="font-medium px-3 py-2 rounded-lg transition-all bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
            >
              交易記錄
            </button>
            <button
              onClick={async () => {
                await fetchClosingStats()
                setShowClosingModal(true)
              }}
              className="font-medium px-3 py-2 rounded-lg transition-all bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
            >
              日結
            </button>
            <div className="text-sm text-slate-400 ml-2">
              {new Date().toLocaleString('zh-TW')}
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left - 商品區 (等分) */}
          <div className="flex-1 flex flex-col bg-slate-800 p-3 overflow-hidden border-r border-slate-700">
            {/* Mode Toggle */}
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setInventoryMode('products')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${inventoryMode === 'products'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                商品庫
              </button>
              <button
                onClick={() => setInventoryMode('ichiban')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${inventoryMode === 'ichiban'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
              >
                一番賞
              </button>
            </div>

            {inventoryMode === 'products' && (
              <>
                <div className="mb-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const value = e.target.value
                      setSearchQuery(value)

                      if (scanTimeoutRef.current) {
                        clearTimeout(scanTimeoutRef.current)
                      }

                      scanTimeoutRef.current = setTimeout(() => {
                        if (value.trim()) {
                          const matchedProduct = products.find(
                            p => p.barcode && p.barcode.toLowerCase() === value.toLowerCase()
                          )

                          if (matchedProduct) {
                            addToCart(matchedProduct, 1)
                            setSearchQuery('')
                          }
                        }
                      }, 100)
                    }}
                    placeholder="🔍 掃描或搜尋商品..."
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white bg-slate-700 border border-slate-600 focus:border-indigo-500 focus:outline-none placeholder-slate-400"
                  />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-3 gap-2">
                    {filteredProducts.map((product) => {
                      const isPinned = pinnedProductIds.has(product.id)
                      const isLowStock = product.stock <= 3 && product.stock > 0
                      // 只有當不允許負庫存時，庫存 0 才禁止銷售
                      const isOutOfStock = !product.allow_negative && product.stock <= 0
                      return (
                        <button
                          key={product.id}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            togglePinProduct(product.id)
                          }}
                          className={`rounded-lg p-2.5 transition-all active:scale-95 flex flex-col min-h-[90px] relative ${isOutOfStock
                            ? 'bg-slate-800 opacity-40 cursor-not-allowed'
                            : 'bg-slate-700 hover:bg-slate-600 cursor-pointer'
                            }`}
                          title={isOutOfStock ? '庫存不足' : isPinned ? '右鍵取消固定' : '右鍵固定到最上面'}
                          disabled={isOutOfStock}
                          onClick={(e) => {
                            if (isOutOfStock) {
                              e.preventDefault()
                              return
                            }
                            addToCart(product, 1)
                          }}
                        >
                          {/* 標籤區 */}
                          <div className="absolute top-1.5 right-1.5 flex gap-1">
                            {isPinned && <span className="text-xs">⭐</span>}
                            {isLowStock && <span className="text-[10px] bg-amber-500 text-white px-1 rounded">低庫存</span>}
                          </div>
                          {/* 商品名 */}
                          <div className="text-xs text-slate-300 line-clamp-2 mb-auto pr-6">{product.name}</div>
                          {/* 價格 - 最大 */}
                          <div className="text-lg font-bold text-white mt-1">{formatCurrency(product.price)}</div>
                          {/* 庫存 - 小字 */}
                          <div className="text-[10px] text-slate-400">庫存 {product.stock}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {inventoryMode === 'ichiban' && (
              <>
                <div className="mb-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const value = e.target.value
                      setSearchQuery(value)

                      // 清除上次的定时器
                      if (scanTimeoutRef.current) {
                        clearTimeout(scanTimeoutRef.current)
                      }

                      // 设置新的定时器，扫描枪通常在100ms内完成输入
                      scanTimeoutRef.current = setTimeout(() => {
                        if (value.trim()) {
                          // 查找匹配的一番赏（精确匹配条码）
                          const matchedKuji = ichibanKujis.find(
                            kuji => kuji.barcode && kuji.barcode.toLowerCase() === value.toLowerCase()
                          )

                          if (matchedKuji) {
                            // 自动展开对应的一番赏
                            setExpandedKujiId(matchedKuji.id)
                            // 清空搜索框
                            setSearchQuery('')
                          }
                        }
                      }, 100)
                    }}
                    placeholder="掃描條碼或搜尋一番賞"
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded px-3 py-2 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none"
                  />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-3 gap-2">
                    {!expandedKujiId ? (
                      // 顯示一番賞系列
                      <>
                        {ichibanKujis
                          .filter((kuji) => {
                            const searchLower = searchQuery.toLowerCase()
                            return kuji.name.toLowerCase().includes(searchLower) ||
                              (kuji.barcode && kuji.barcode.toLowerCase().includes(searchLower))
                          })
                          .map((kuji) => {
                            const totalRemaining = (kuji.ichiban_kuji_prizes || []).reduce(
                              (sum: number, prize: any) => sum + prize.remaining,
                              0
                            )
                            const prizeCount = (kuji.ichiban_kuji_prizes || []).length

                            return (
                              <button
                                key={kuji.id}
                                onClick={() => setExpandedKujiId(kuji.id)}
                                className="rounded p-4 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[120px] border-2 bg-teal-200 hover:bg-teal-300 border-teal-400 dark:bg-teal-900 dark:hover:bg-teal-800 dark:border-teal-700"
                              >
                                <div className="text-lg font-bold mb-2 text-center text-teal-950 dark:text-teal-100">
                                  {kuji.name}
                                </div>
                                <div className="text-sm text-teal-800 dark:text-teal-300 mb-1">
                                  賞品數: {prizeCount}
                                </div>
                                <div className="text-sm text-teal-800 dark:text-teal-300">
                                  剩餘總數: {totalRemaining}
                                </div>
                              </button>
                            )
                          })}
                        {ichibanKujis.filter((kuji) => {
                          const searchLower = searchQuery.toLowerCase()
                          return kuji.name.toLowerCase().includes(searchLower) ||
                            (kuji.barcode && kuji.barcode.toLowerCase().includes(searchLower))
                        }).length === 0 && (
                            <div className="col-span-3 text-center text-gray-500 dark:text-gray-400 py-10">
                              <div className="text-4xl mb-2">🎁</div>
                              <div>{searchQuery ? '找不到相關的一番賞' : '目前沒有一番賞'}</div>
                            </div>
                          )}
                      </>
                    ) : (
                      // 顯示選中系列的賞品
                      <>
                        {(() => {
                          const selectedKuji = ichibanKujis.find(k => k.id === expandedKujiId)
                          if (!selectedKuji) return null

                          return (
                            <>
                              {/* 返回按鈕 */}
                              <div className="col-span-3">
                                <button
                                  onClick={() => setExpandedKujiId(null)}
                                  className="flex items-center gap-2 px-4 py-2 bg-teal-200 hover:bg-teal-300 dark:bg-teal-900 dark:hover:bg-teal-800 rounded text-teal-950 dark:text-teal-100 font-medium transition-colors"
                                >
                                  <span>←</span>
                                  <span>{selectedKuji.name}</span>
                                </button>
                              </div>

                              {/* 賞品列表 */}
                              {(selectedKuji.ichiban_kuji_prizes || []).map((prize: any) => (
                                <button
                                  key={prize.id}
                                  onClick={() => addIchibanPrize(selectedKuji, prize)}
                                  disabled={prize.remaining <= 0}
                                  className={`rounded p-3 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[100px] border-2 ${prize.remaining <= 0
                                    ? 'bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-500 cursor-not-allowed opacity-50'
                                    : 'bg-teal-700 hover:bg-teal-800 text-white border-teal-800'
                                    }`}
                                >
                                  <div className="text-xs font-bold mb-1 text-center px-2 py-0.5 bg-white/20 rounded">
                                    {prize.prize_tier}
                                  </div>
                                  <div className="text-sm font-bold text-center mb-1 line-clamp-2">
                                    {prize.products.name}
                                  </div>
                                  <div className="text-lg font-bold">{formatCurrency(selectedKuji.price || 0)}</div>
                                  <div className="text-xs mt-1">剩餘: {prize.remaining}</div>
                                </button>
                              ))}
                            </>
                          )
                        })()}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Middle - 購物車 (等分) */}
          <div className="flex-1 bg-slate-900 flex flex-col border-r border-slate-700">
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h2 className="font-bold text-lg text-white">購物清單</h2>
              {cart.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={toggleAllFreeGift}
                    className="bg-slate-600 hover:bg-slate-500 text-white px-3 py-1 rounded-lg text-sm transition-all"
                    title={cart.every(item => item.isFreeGift || item.ichiban_kuji_prize_id) ? "取消全選贈品" : "全選贈品"}
                  >
                    {cart.every(item => item.isFreeGift || item.ichiban_kuji_prize_id) ? "取消贈品" : "全選贈品"}
                  </button>
                  <button
                    onClick={() => setCart([])}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-sm transition-all"
                  >
                    清空
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center text-slate-500 mt-20">
                  <div className="text-4xl mb-2">🛒</div>
                  <div className="text-slate-400">請點選商品</div>
                </div>
              ) : (
                displayCart.map((item, displayIndex) => {
                  const isGrouped = !!item.groupedCount && item.groupedCount > 1
                  const hasComboDiscount = item.ichiban_kuji_id && isGrouped

                  // Calculate average price for grouped items
                  const avgOriginalPrice = isGrouped
                    ? item.indices!.reduce((sum, idx) => sum + cart[idx].price, 0) / item.indices!.length
                    : (cart[item.indices![0]]?.price || item.price)

                  return (
                    <div
                      key={`display-${displayIndex}`}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-white">
                            {item.product.name}
                            {item.ichiban_kuji_id && (
                              <span className="ml-2 text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded">一番賞</span>
                            )}
                            {hasComboDiscount && (
                              <span className="ml-2 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded">組合</span>
                            )}
                            {cart[item.indices![0]]?.isFreeGift && (
                              <span className="ml-2 text-xs bg-red-500 text-white px-2 py-0.5 rounded">贈品</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {hasComboDiscount && (
                              <span className="line-through mr-2">{formatCurrency(avgOriginalPrice)}</span>
                            )}
                            {formatCurrency(item.price)}
                            {isGrouped && <span className="ml-2">× {item.quantity} 抽</span>}
                          </div>
                          {!item.ichiban_kuji_id && (
                            <label className="flex items-center gap-1 mt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cart[item.indices![0]]?.isFreeGift || false}
                                onChange={() => toggleFreeGift(item.indices![0])}
                                className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-600 dark:text-gray-400">贈品</span>
                            </label>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            // Remove all items in this group
                            if (item.indices && item.indices.length > 0) {
                              // Remove in reverse order to maintain correct indices
                              const sortedIndices = [...item.indices].sort((a, b) => b - a)
                              sortedIndices.forEach(idx => {
                                removeFromCart(cart[idx].product_id, idx)
                              })
                            }
                          }}
                          className="text-red-600 hover:text-red-800 font-bold text-lg ml-2"
                        >
                          ×
                        </button>
                      </div>

                      {/* Show details for grouped items */}
                      {isGrouped && item.indices && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 space-y-1">
                          {item.indices.map((idx) => {
                            const cartItem = cart[idx]
                            const priceItem = cartWithComboPrice[idx]
                            return (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <div className="flex-1 flex items-center gap-2">
                                  <span className="text-purple-600 dark:text-purple-400 font-bold">
                                    {cartItem.product.name.match(/】(.+?) -/)?.[1] || '賞'}
                                  </span>
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {cartItem.product.name.split(' - ')[1] || cartItem.product.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500 dark:text-gray-500">
                                    {formatCurrency(priceItem.price)}
                                  </span>
                                  <button
                                    onClick={() => removeFromCart(cartItem.product_id, idx)}
                                    className="text-red-500 hover:text-red-700 font-bold"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        {!item.ichiban_kuji_id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                              className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-gray-100"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const newQty = parseInt(e.target.value) || 1
                                if (newQty > 0) {
                                  updateQuantity(item.product_id, newQty)
                                }
                              }}
                              className="w-14 h-7 text-center font-bold text-sm text-black dark:text-gray-100 bg-gray-100 dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                              className="w-7 h-7 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 rounded font-bold text-sm text-black dark:text-gray-100"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                            {item.groupedCount} 個賞項
                          </div>
                        )}
                        <div className="text-base font-bold text-black dark:text-gray-100">
                          {formatCurrency(item.price * item.quantity)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Total Display - 金額區域 */}
            <div className="bg-slate-800 border-t border-slate-700 p-4">
              {/* Show combo price info */}
              {cart.some(item => item.ichiban_kuji_id) && (() => {
                const uniqueKujiIds = [...new Set(cart.filter(item => item.ichiban_kuji_id).map(item => item.ichiban_kuji_id!))]
                return uniqueKujiIds.map(kuji_id => {
                  const info = getIchibanComboInfo(kuji_id)
                  if (info.applicableCombo) {
                    return (
                      <div key={kuji_id} className="mb-3 p-2 bg-emerald-900/30 border border-emerald-600 rounded-lg">
                        <div className="text-sm font-medium text-emerald-400">
                          🎉 {info.kuji?.name} 組合優惠
                        </div>
                        <div className="text-xs text-emerald-500">
                          {info.applicableCombo.draws} 抽 {formatCurrency(info.applicableCombo.price)} (已購 {info.totalCount} 抽)
                        </div>
                      </div>
                    )
                  }
                  return null
                })
              })()}

              {/* 折扣資訊（有時才顯示） */}
              {discountAmount > 0 && (
                <div className="mb-3 text-sm space-y-1">
                  <div className="flex justify-between text-red-400">
                    <span>折扣</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                </div>
              )}

              {/* 應收金額 */}
              <div className="flex justify-between items-center">
                <span className="text-base text-slate-400">應收</span>
                <span className="text-3xl font-bold text-white">{formatCurrency(total)}</span>
              </div>

              {/* 現金收銀區 - 僅現金帳戶顯示 */}
              {isCashAccount && cart.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  {/* 實收金額 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400 whitespace-nowrap">實收</span>
                    <input
                      type="number"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="0"
                      className="flex-1 rounded px-3 py-1.5 text-right text-lg font-bold text-white bg-slate-700 border border-slate-600 focus:border-indigo-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => setReceivedAmount(String(total))}
                      className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors font-medium whitespace-nowrap"
                    >
                      收剛好
                    </button>
                    <button
                      onClick={() => setReceivedAmount('')}
                      className="px-2 py-1.5 text-xs bg-slate-600 hover:bg-slate-500 text-slate-300 rounded transition-colors whitespace-nowrap"
                    >
                      清除
                    </button>
                  </div>

                  {/* 找零顯示 */}
                  {receivedAmount && parseFloat(receivedAmount) > 0 && (
                    <div className={`mt-2 rounded px-3 py-2 flex items-center justify-between ${parseFloat(receivedAmount) >= total
                      ? 'bg-emerald-900/40'
                      : 'bg-red-900/40'
                      }`}>
                      <span className={`text-sm ${parseFloat(receivedAmount) >= total ? 'text-emerald-400' : 'text-red-400'}`}>
                        {parseFloat(receivedAmount) === total ? '✓ 剛好' : parseFloat(receivedAmount) > total ? '找零' : '尚差'}
                      </span>
                      {parseFloat(receivedAmount) !== total && (
                        <span className={`text-xl font-bold ${parseFloat(receivedAmount) > total ? 'text-emerald-300' : 'text-red-300'}`}>
                          {formatCurrency(Math.abs(parseFloat(receivedAmount) - total))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right - 結帳區 (等分) */}
          <div className="flex-1 bg-slate-800 flex flex-col">
            {error && (
              <div className="bg-red-100 dark:bg-red-900 border-2 border-red-500 dark:border-red-600 text-red-700 dark:text-red-200 rounded-lg px-4 py-3 m-4 mb-0">
                {error}
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {/* Customer */}
              <div className="relative">
                <label className="block font-medium mb-1.5 text-sm text-slate-300">客戶</label>
                <div className="relative">
                  <input
                    ref={customerInputRef}
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value)
                      setShowCustomerDropdown(true)
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder={selectedCustomer ? selectedCustomer.customer_name : '散客 (點擊搜尋)'}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white bg-slate-700 border border-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                  {selectedCustomer && (
                    <button
                      onClick={() => {
                        setSelectedCustomer(null)
                        setCustomerSearchQuery('')
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-600 font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Dropdown */}
                {showCustomerDropdown && (
                  <div className="customer-dropdown absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
                    {/* 散客選項 */}
                    <button
                      onClick={() => {
                        setSelectedCustomer(null)
                        setCustomerSearchQuery('')
                        setShowCustomerDropdown(false)
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-black dark:text-gray-100 border-b border-gray-200 dark:border-gray-600"
                    >
                      <div className="font-bold">散客</div>
                      <div className="text-xs text-gray-500">不選擇客戶</div>
                    </button>

                    {/* 過濾後的客戶列表 */}
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => {
                          setSelectedCustomer(customer)
                          setCustomerSearchQuery('')
                          setShowCustomerDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-black dark:text-gray-100 border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold">{customer.customer_name}</div>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {customer.customer_code} {customer.phone && `• ${customer.phone}`}
                        </div>
                      </button>
                    ))}

                    {filteredCustomers.length === 0 && customerSearchQuery && (
                      <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                        找不到客戶
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setShowQuickAddCustomer(true)}
                  className="w-full mt-2 bg-green-500 hover:bg-green-600 text-white font-bold px-3 py-2 rounded-lg text-sm transition-all"
                >
                  + 新增客戶
                </button>

                {/* 显示选中客户的信用額度 */}
                {selectedCustomer && selectedCustomer.credit_limit > 0 && (
                  <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">信用額度</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        ${selectedCustomer.credit_limit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Method - Dynamic from Accounts */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-medium text-sm text-slate-300">付款方式</label>
                  <button
                    onClick={() => {
                      setReorderAccounts([...accounts])
                      setShowAccountReorder(true)
                    }}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                    title="調整排序"
                  >
                    ⚙️
                  </button>
                </div>

                {/* 單一付款模式：從帳戶列表動態產生按鈕 */}
                {!isMultiPayment && (
                  <div className="grid grid-cols-2 gap-2">
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
                          className={`py-2.5 px-3 rounded-lg text-sm transition-all ${selectedAccountId === account.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
                      className={`py-2.5 px-3 rounded-lg text-sm transition-all ${selectedAccountId === null
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                    >
                      ❓ 待定
                    </button>
                  </div>
                )}

                {/* Multi-payment toggle */}
                {isPaid && !isMultiPayment && selectedAccountId && (
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        setIsMultiPayment(true)
                        setMultiPayments([{ account_id: selectedAccountId!, amount: String(total) }])
                      }}
                      className="w-full py-2 rounded-lg text-sm font-medium transition-all bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
                    >
                      ➕ 切換多元付款
                    </button>
                  </div>
                )}

                {/* Multi-payment inputs */}
                {isMultiPayment && isPaid && (
                  <div className="space-y-2 p-3 bg-slate-700/50 rounded-lg border border-orange-500">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-orange-400">🔀 多元付款模式</div>
                      <button
                        onClick={() => {
                          setIsMultiPayment(false)
                          setMultiPayments([])
                        }}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 transition-colors"
                      >
                        ← 返回單一付款
                      </button>
                    </div>
                    {multiPayments.map((payment, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <select
                          value={payment.account_id}
                          onChange={(e) => {
                            const updated = [...multiPayments]
                            updated[index].account_id = e.target.value
                            setMultiPayments(updated)
                          }}
                          className="flex-1 rounded px-2 py-1.5 text-sm bg-slate-600 text-white border border-slate-500 focus:border-indigo-500 focus:outline-none"
                        >
                          {accounts.map((account) => {
                            const icon = account.account_type === 'cash' ? '💵' : account.account_type === 'bank' ? '🏦' : '💰'
                            return (
                              <option key={account.id} value={account.id}>
                                {icon} {account.account_name}
                              </option>
                            )
                          })}
                        </select>
                        <input
                          type="number"
                          value={payment.amount}
                          onChange={(e) => {
                            const updated = [...multiPayments]
                            updated[index].amount = e.target.value
                            setMultiPayments(updated)
                          }}
                          placeholder="金額"
                          className="w-24 rounded px-2 py-1.5 text-sm text-right bg-slate-600 text-white border border-slate-500 focus:border-indigo-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {multiPayments.length > 1 && (
                          <button
                            onClick={() => {
                              setMultiPayments(multiPayments.filter((_, i) => i !== index))
                            }}
                            className="text-red-400 hover:text-red-300 px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        // 預設使用第一個帳戶
                        const defaultAccountId = accounts[0]?.id || ''
                        setMultiPayments([...multiPayments, { account_id: defaultAccountId, amount: '' }])
                      }}
                      className="w-full py-1.5 text-xs text-slate-400 hover:text-white border border-dashed border-slate-500 rounded hover:border-slate-400 transition-colors"
                    >
                      ＋ 新增付款方式
                    </button>

                    {/* 金額統計 */}
                    <div className="pt-2 border-t border-slate-600 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">已分配</span>
                        <span className={`font-bold ${multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) === total
                          ? 'text-emerald-400'
                          : 'text-orange-400'
                          }`}>
                          {formatCurrency(multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0))}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">應收</span>
                        <span className="text-white">{formatCurrency(total)}</span>
                      </div>
                      {multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) !== total && (
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-400">差額</span>
                          <span className="text-orange-400 font-bold">
                            {formatCurrency(Math.abs(total - multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Discount - Button Selection */}
              <div>
                <label className="block font-bold mb-1.5 text-sm text-black dark:text-gray-100">折扣</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    onClick={() => {
                      setDiscountType('none')
                      setDiscountValue(0)
                    }}
                    className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${discountType === 'none'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                  >
                    無折扣
                  </button>
                  <button
                    onClick={() => setDiscountType('percent')}
                    className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${discountType === 'percent'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                  >
                    百分比
                  </button>
                  <button
                    onClick={() => setDiscountType('amount')}
                    className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${discountType === 'amount'
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
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2 text-base text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                    placeholder={discountType === 'percent' ? '折扣 %' : '折扣金額'}
                  />
                )}
              </div>

              {/* Payment Status + Delivery Status - 同一排 */}
              <div className="flex gap-2">
                <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2.5 bg-slate-700 hover:bg-slate-600">
                  <input
                    type="checkbox"
                    checked={isPaid}
                    onChange={(e) => setIsPaid(e.target.checked)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="text-sm text-white">已收款</span>
                </label>
                <label className="flex-1 flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2.5 bg-slate-700 hover:bg-slate-600">
                  <input
                    type="checkbox"
                    checked={!isDelivered}
                    onChange={(e) => setIsDelivered(!e.target.checked)}
                    className="w-4 h-4 accent-indigo-500"
                  />
                  <span className="text-sm text-white">未出貨</span>
                </label>
              </div>
            </div>

            {/* Delivery Details - Only when not delivered */}
            {!isDelivered && (
              <div className="space-y-2 border-2 border-orange-400 dark:border-orange-600 rounded-lg p-3 bg-orange-50 dark:bg-orange-900/20">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">預計出貨日</label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">交貨方式</label>
                  <input
                    type="text"
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value)}
                    placeholder="例：宅配、自取、門市取貨"
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">備註</label>
                  <textarea
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    placeholder="出貨相關備註"
                    rows={2}
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-2 py-1 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700 resize-none"
                  />
                </div>
              </div>
            )}





            {/* Checkout Button - Fixed at bottom - 放大結帳按鈕 */}
            <div className="p-3 border-t border-slate-700 bg-slate-800">
              {/* 現金不足提示 */}
              {!isMultiPayment && isCashAccount && cart.length > 0 && receivedAmount && parseFloat(receivedAmount) > 0 && parseFloat(receivedAmount) < total && (
                <div className="mb-2 text-center text-red-400 text-sm">
                  收款不足，尚差 {formatCurrency(total - parseFloat(receivedAmount))}
                </div>
              )}
              {/* 多元付款金額不符提示 */}
              {isMultiPayment && isPaid && cart.length > 0 && multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) !== total && (
                <div className="mb-2 text-center text-orange-400 text-sm">
                  ⚠️ 付款金額不符，請調整分配金額
                </div>
              )}
              <button
                onClick={handleCheckout}
                disabled={
                  loading ||
                  cart.length === 0 ||
                  // 現金帳戶且有輸入金額但不足時禁用
                  (!isMultiPayment && isCashAccount && !!receivedAmount && parseFloat(receivedAmount) > 0 && parseFloat(receivedAmount) < total) ||
                  // 多元付款金額不符時禁用
                  (isMultiPayment && isPaid && multiPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) !== total)
                }
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 text-white font-bold text-xl py-4 rounded-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed"
              >
                {loading ? '處理中...' : '確認結帳'}
              </button>
              {cart.length > 0 && (
                <button
                  onClick={handleSaveDraft}
                  disabled={loading}
                  className="w-full mt-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-600 text-slate-300 font-medium py-2 rounded-lg transition-all text-sm"
                >
                  暫存訂單
                </button>
              )}
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
              <div className="p-4 overflow-y-auto custom-scrollbar max-h-[calc(80vh-80px)]">
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
              <div className={`text-white px-6 py-4 rounded-t-lg flex items-center justify-between ${salesMode === 'live' ? 'bg-pink-600' : 'bg-blue-500'
                }`}>
                <h2 className="text-xl font-bold">
                  今日交易 - {salesMode === 'live' ? '📱 直播模式' : '🏪 店裡模式'}
                </h2>
                <button onClick={() => setShowTodaySales(false)} className="text-2xl hover:text-gray-200">×</button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar max-h-[calc(80vh-80px)]">
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

        {/* Quick Add Customer Modal */}
        {showQuickAddCustomer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowQuickAddCustomer(false)}>
            <div className="bg-white dark:bg-gray-800 w-[500px] rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="bg-green-500 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                <h2 className="text-xl font-bold">快速建立客戶</h2>
                <button onClick={() => setShowQuickAddCustomer(false)} className="text-2xl hover:text-gray-200">×</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block font-bold mb-2 text-black dark:text-gray-100">
                    客戶名稱 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        phoneInputRef.current?.focus()
                      }
                    }}
                    placeholder="請輸入客戶名稱"
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-4 py-3 text-lg text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block font-bold mb-2 text-black dark:text-gray-100">
                    客戶電話 <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={phoneInputRef}
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !addingCustomer) {
                        handleQuickAddCustomer()
                      }
                    }}
                    placeholder="請輸入客戶電話"
                    className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-4 py-3 text-lg text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleQuickAddCustomer}
                    disabled={addingCustomer}
                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition-all"
                  >
                    {addingCustomer ? '建立中...' : '建立客戶'}
                  </button>
                  <button
                    onClick={() => setShowQuickAddCustomer(false)}
                    className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-black dark:text-gray-100 font-bold py-3 rounded-lg transition-all"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quantity Input Modal */}
        {showQuantityModal && quantityModalProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={closeQuantityModal}>
            <div className="bg-white dark:bg-gray-800 w-[400px] rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
                <h2 className="text-xl font-bold">輸入數量</h2>
                <button onClick={closeQuantityModal} className="text-2xl hover:text-gray-200">×</button>
              </div>
              <form onSubmit={handleQuantitySubmit} className="p-6 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="font-bold text-lg text-center text-gray-900 dark:text-gray-100 mb-2">
                    {quantityModalProduct.name}
                  </div>
                  <div className="text-center text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(quantityModalProduct.price)}
                  </div>
                  <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
                    庫存: {quantityModalProduct.stock}
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-2 text-black dark:text-gray-100">
                    數量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={quantityInputRef}
                    type="number"
                    min="1"
                    step="1"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleQuantitySubmit(e)
                      }
                    }}
                    className="w-full text-center text-3xl font-bold border-2 border-gray-400 dark:border-gray-600 rounded-lg px-4 py-4 text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                    placeholder="請輸入數量"
                  />
                </div>

                {/* Quick number buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[1, 5, 10, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuantityInput(String(num))}
                      className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-black dark:text-gray-100 font-bold py-2 rounded-lg transition-all"
                    >
                      {num}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-all text-lg"
                  >
                    確認加入
                  </button>
                  <button
                    type="button"
                    onClick={closeQuantityModal}
                    className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-black dark:text-gray-100 font-bold py-3 rounded-lg transition-all"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Business Day Closing Modal (日結對話框) */}
        {showClosingModal && closingStats && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowClosingModal(false)}>
            <div className="bg-white dark:bg-gray-800 w-full max-w-2xl rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-4 rounded-t-lg">
                <h2 className="text-2xl font-bold">營業日結算</h2>
                <p className="text-sm opacity-90 mt-1">
                  結算時間：{new Date(lastClosingTime).toLocaleString('zh-TW', { timeZone: 'UTC' })} ~ 現在
                </p>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* 統計摘要 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">
                      總銷售筆數
                    </div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                      {closingStats.sales_count} 筆
                    </div>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-sm font-medium text-green-800 dark:text-green-400 mb-1">
                      總營業額
                    </div>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-300">
                      {formatCurrency(closingStats.total_sales)}
                    </div>
                  </div>
                </div>

                {/* 已收款 vs 未收款 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border-2 border-emerald-200 dark:border-emerald-700">
                    <div className="text-sm font-medium text-emerald-800 dark:text-emerald-400 mb-1">
                      ✅ 已收款
                    </div>
                    <div className="text-xl font-bold text-emerald-600 dark:text-emerald-300">
                      {formatCurrency(closingStats.paid_sales || 0)}
                    </div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {closingStats.paid_count || 0} 筆
                    </div>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border-2 border-orange-200 dark:border-orange-700">
                    <div className="text-sm font-medium text-orange-800 dark:text-orange-400 mb-1">
                      ⏳ 未收款
                    </div>
                    <div className="text-xl font-bold text-orange-600 dark:text-orange-300">
                      {formatCurrency(closingStats.unpaid_sales || 0)}
                    </div>
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                      {closingStats.unpaid_count || 0} 筆
                    </div>
                  </div>
                </div>

                {/* 已收款明細 */}
                <div className="border-t dark:border-gray-700 pt-4">
                  <h3 className="font-semibold text-lg mb-3 text-gray-900 dark:text-gray-100">✅ 已收款明細</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded px-4 py-2 border border-emerald-200 dark:border-emerald-700">
                      <span className="text-emerald-700 dark:text-emerald-300">現金</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                        {formatCurrency(closingStats.paid_cash || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded px-4 py-2 border border-emerald-200 dark:border-emerald-700">
                      <span className="text-emerald-700 dark:text-emerald-300">刷卡</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                        {formatCurrency(closingStats.paid_card || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded px-4 py-2 border border-emerald-200 dark:border-emerald-700">
                      <span className="text-emerald-700 dark:text-emerald-300">轉帳</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                        {formatCurrency(closingStats.paid_transfer || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 rounded px-4 py-2 border border-emerald-200 dark:border-emerald-700">
                      <span className="text-emerald-700 dark:text-emerald-300">貨到付款</span>
                      <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                        {formatCurrency(closingStats.paid_cod || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 備註 */}
                <div className="border-t dark:border-gray-700 pt-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    備註（選填）
                  </label>
                  <textarea
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    placeholder="例如：早班、晚班、值班人員等..."
                    className="w-full border dark:border-gray-600 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none"
                    rows={3}
                  />
                </div>
              </div>

              <div className="border-t dark:border-gray-700 px-6 py-4 flex gap-3">
                <button
                  onClick={handleClosing}
                  disabled={closingInProgress}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition-all"
                >
                  {closingInProgress ? '結算中...' : '確認日結'}
                </button>
                <button
                  onClick={() => setShowClosingModal(false)}
                  disabled={closingInProgress}
                  className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 disabled:bg-gray-200 text-gray-900 dark:text-gray-100 font-bold py-3 rounded-lg transition-all"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 結帳成功 Toast */}
      {successToast && (
        <div
          className="fixed top-6 right-6 z-[100] animate-in slide-in-from-right duration-300"
          onClick={() => setSuccessToast(null)}
        >
          <div className="bg-emerald-600 text-white rounded-xl shadow-2xl p-5 min-w-[280px] cursor-pointer hover:bg-emerald-700 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl">✓</div>
              <div>
                <div className="font-bold text-lg">結帳成功</div>
                <div className="text-sm text-emerald-200">{successToast.saleNo}</div>
              </div>
            </div>
            <div className="space-y-1 text-sm border-t border-emerald-500 pt-3">
              <div className="flex justify-between">
                <span className="text-emerald-200">總計</span>
                <span className="font-bold">{formatCurrency(successToast.total)}</span>
              </div>
              {successToast.change > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-emerald-200">收款</span>
                    <span className="font-bold">{formatCurrency(successToast.received)}</span>
                  </div>
                  <div className="flex justify-between border-t border-emerald-500 pt-2 mt-2">
                    <span className="text-emerald-100 font-medium">找零</span>
                    <span className="font-bold text-xl text-yellow-300">{formatCurrency(successToast.change)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 帳戶排序彈窗 */}
      {showAccountReorder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowAccountReorder(false)}>
          <div className="bg-slate-800 w-full max-w-md rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-white">調整付款方式順序</h3>
              <button
                onClick={() => setShowAccountReorder(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {reorderAccounts.map((account, index) => {
                const icon = account.account_type === 'cash' ? '💵' : account.account_type === 'bank' ? '🏦' : '💰'
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-2 bg-slate-700 rounded-lg p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => {
                          if (index > 0) {
                            const newOrder = [...reorderAccounts]
                            ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
                            setReorderAccounts(newOrder)
                          }
                        }}
                        disabled={index === 0}
                        className="text-xs px-2 py-0.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded text-slate-300"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => {
                          if (index < reorderAccounts.length - 1) {
                            const newOrder = [...reorderAccounts]
                            ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
                            setReorderAccounts(newOrder)
                          }
                        }}
                        disabled={index === reorderAccounts.length - 1}
                        className="text-xs px-2 py-0.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-30 disabled:cursor-not-allowed rounded text-slate-300"
                      >
                        ▼
                      </button>
                    </div>
                    <span className="text-lg">{icon}</span>
                    <span className="flex-1 text-white">{account.account_name}</span>
                    <span className="text-slate-400 text-sm">#{index + 1}</span>
                  </div>
                )
              })}
            </div>
            <div className="px-4 py-3 border-t border-slate-700 flex gap-2">
              <button
                onClick={() => setShowAccountReorder(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch('/api/accounts/reorder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        accountIds: reorderAccounts.map(a => a.id)
                      })
                    })
                    const data = await res.json()
                    if (data.ok) {
                      setAccounts(reorderAccounts)
                      setShowAccountReorder(false)
                    } else {
                      alert('排序更新失敗: ' + data.error)
                    }
                  } catch (err) {
                    alert('排序更新失敗')
                  }
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
              >
                儲存排序
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
