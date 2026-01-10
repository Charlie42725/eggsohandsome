'use client'

import { useState, useEffect, useRef } from 'react'
import { formatCurrency } from '@/lib/utils'
import type { Product, SaleItem, PaymentMethod } from '@/types'

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

  // Quantity input modal
  const [showQuantityModal, setShowQuantityModal] = useState(false)
  const [quantityModalProduct, setQuantityModalProduct] = useState<Product | null>(null)
  const [quantityInput, setQuantityInput] = useState('1')
  const quantityInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchCustomers()
    fetchProducts()
    fetchIchibanKujis()
    fetchDrafts()
    fetchTodaySales()
  }, [])

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

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?all=true&active=true')
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

  const addToCart = (product: Product, quantity: number = 1, ichibanInfo?: { kuji_id: string; prize_id: string }) => {
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

  // 计算购物金抵扣（预览）
  const storeCreditUsed = selectedCustomer && selectedCustomer.store_credit > 0
    ? Math.min(selectedCustomer.store_credit, total)
    : 0
  const finalTotal = total - storeCreditUsed

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

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_code: selectedCustomer?.customer_code || undefined,
          source: 'pos',
          payment_method: paymentMethod,
          is_paid: isPaid,
          is_delivered: isDelivered, // 新增：是否已出貨
          delivery_method: !isDelivered ? deliveryMethod : undefined, // 未出貨時保存交貨方式
          expected_delivery_date: !isDelivered ? expectedDeliveryDate : undefined, // 未出貨時保存預計出貨日
          delivery_note: !isDelivered ? deliveryNote : undefined, // 未出貨時保存備註
          note: note || undefined,
          discount_type: discountType,
          discount_value: discountValue,
          items: checkoutCart.map((item) => ({
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
        setPaymentMethod('cash')
        setIsPaid(true)
        setIsDelivered(true) // 重置為已出貨
        setDeliveryMethod('') // 清空交貨方式
        setExpectedDeliveryDate('') // 清空預計出貨日
        setDeliveryNote('') // 清空出貨備註
        setNote('')
        setDiscountType('none')
        setDiscountValue(0)
        fetchTodaySales() // Refresh today's sales
        fetchIchibanKujis() // Refresh ichiban kuji inventory
        fetchCustomers() // Refresh customers to update store credit
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
      // Use combo price adjusted cart for saving draft
      const draftCart = applyComboPrice()

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
      setCustomerSearchQuery('')
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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredCustomers = customers.filter(c =>
    c.customer_name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.customer_code.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
    c.phone?.toLowerCase().includes(customerSearchQuery.toLowerCase())
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
      <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b-2 border-gray-300 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-black dark:text-gray-100">POS 收銀系統</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg transition-all relative"
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
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg transition-all"
          >
            今日交易
          </button>
          <div className="text-sm text-black dark:text-gray-300">{new Date().toLocaleString('zh-TW')}</div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left - Product Grid */}
        <div className="w-[500px] flex flex-col bg-white dark:bg-gray-800 p-4 overflow-hidden border-r-2 border-gray-300 dark:border-gray-700">
          {/* Mode Toggle */}
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setInventoryMode('products')}
              className={`flex-1 py-2 px-4 rounded-lg font-bold border-2 transition-all ${
                inventoryMode === 'products'
                  ? 'bg-blue-700 border-blue-800 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              商品庫
            </button>
            <button
              onClick={() => setInventoryMode('ichiban')}
              className={`flex-1 py-2 px-4 rounded-lg font-bold border-2 transition-all ${
                inventoryMode === 'ichiban'
                  ? 'bg-teal-700 border-teal-800 text-white shadow-md'
                  : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              一番賞庫
            </button>
          </div>

          {inventoryMode === 'products' && (
            <>
              <div className="mb-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="掃描條碼或搜尋商品"
                  className="w-full border-2 border-gray-400 dark:border-gray-600 rounded px-3 py-2 text-sm text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="mb-3 px-2 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-xs text-gray-700 dark:text-gray-300">
                💡 <span className="font-semibold">左鍵</span>：快速加1個 | <span className="font-semibold">右鍵</span>：輸入數量
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-3 gap-2">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product, 1)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        openQuantityModal(product)
                      }}
                      className="bg-blue-700 hover:bg-blue-800 text-white rounded p-3 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[100px] border border-blue-800 relative group"
                      title="左鍵：加1個 | 右鍵：輸入數量"
                    >
                      <div className="text-sm font-bold text-center mb-1 line-clamp-2">{product.name}</div>
                      <div className="text-lg font-bold">{formatCurrency(product.price)}</div>
                      <div className="text-xs mt-1">庫存: {product.stock}</div>
                      {/* 提示标签 */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs bg-yellow-400 text-gray-900 px-1 py-0.5 rounded">右鍵輸入</span>
                      </div>
                    </button>
                  ))}
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
                    
                    // 如果输入的是条码，自动查找并展开对应的一番赏
                    if (value.trim()) {
                      const matchedKuji = ichibanKujis.find(
                        kuji => kuji.barcode && kuji.barcode.toLowerCase() === value.toLowerCase()
                      )
                      if (matchedKuji) {
                        setExpandedKujiId(matchedKuji.id)
                        setSearchQuery('')  // 清空搜索框
                      }
                    }
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
                                className={`rounded p-3 shadow hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center min-h-[100px] border-2 ${
                                  prize.remaining <= 0
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

        {/* Middle - Cart */}
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 flex flex-col border-r-2 border-gray-300 dark:border-gray-700">
          <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b-2 border-gray-300 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-bold text-lg text-black dark:text-gray-100">購物清單</h2>
            {cart.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={toggleAllFreeGift}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1 rounded text-sm transition-all"
                  title={cart.every(item => item.isFreeGift || item.ichiban_kuji_prize_id) ? "取消全選贈品" : "全選贈品"}
                >
                  {cart.every(item => item.isFreeGift || item.ichiban_kuji_prize_id) ? "取消贈品" : "全選贈品"}
                </button>
                <button
                  onClick={() => setCart([])}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1 rounded text-sm transition-all"
                >
                  清空
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
                <div className="text-4xl mb-2">🛒</div>
                <div className="text-black dark:text-gray-300">請點選商品</div>
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
                    className="bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex-1">
                        <div className="font-bold text-sm text-black dark:text-gray-100">
                          {item.product.name}
                          {item.ichiban_kuji_id && (
                            <span className="ml-2 text-xs bg-purple-500 text-white px-2 py-0.5 rounded">一番賞</span>
                          )}
                          {hasComboDiscount && (
                            <span className="ml-2 text-xs bg-green-500 text-white px-2 py-0.5 rounded">組合優惠</span>
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
                        <span className="w-10 text-center font-bold text-sm text-black dark:text-gray-100">{item.quantity}</span>
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

          {/* Total Display */}
          <div className="bg-white dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-700 p-6">
            {/* Show combo price info */}
            {cart.some(item => item.ichiban_kuji_id) && (() => {
              const uniqueKujiIds = [...new Set(cart.filter(item => item.ichiban_kuji_id).map(item => item.ichiban_kuji_id!))]
              return uniqueKujiIds.map(kuji_id => {
                const info = getIchibanComboInfo(kuji_id)
                if (info.applicableCombo) {
                  return (
                    <div key={kuji_id} className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 rounded-lg">
                      <div className="text-sm font-bold text-green-700 dark:text-green-400">
                        🎉 {info.kuji?.name} 組合優惠
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-500">
                        {info.applicableCombo.draws} 抽 {formatCurrency(info.applicableCombo.price)} (已購 {info.totalCount} 抽)
                      </div>
                    </div>
                  )
                }
                return null
              })
            })()}

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
            {storeCreditUsed > 0 && (
              <div className="flex justify-between items-center mb-2 text-green-600 dark:text-green-400">
                <span className="text-lg">購物金</span>
                <span className="text-2xl font-bold">-{formatCurrency(storeCreditUsed)}</span>
              </div>
            )}
            <div className="border-t-2 border-gray-300 dark:border-gray-700 pt-2 flex justify-between items-center">
              <span className="text-xl text-black dark:text-gray-300">
                {storeCreditUsed > 0 ? '實付金額' : '總計'}
              </span>
              <span className="text-4xl font-bold text-black dark:text-gray-100">
                {formatCurrency(finalTotal)}
              </span>
            </div>
            {storeCreditUsed > 0 && (
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                已使用購物金 {formatCurrency(storeCreditUsed)}，餘額將變為 {formatCurrency(selectedCustomer!.store_credit - storeCreditUsed)}
              </div>
            )}
          </div>
        </div>

        {/* Right - Payment Panel */}
        <div className="w-[450px] bg-white dark:bg-gray-800 flex flex-col">
          {error && (
            <div className="bg-red-100 dark:bg-red-900 border-2 border-red-500 dark:border-red-600 text-red-700 dark:text-red-200 rounded-lg px-4 py-3 m-4 mb-0">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5">
            {/* Customer */}
            <div className="relative">
              <label className="block font-bold mb-1.5 text-sm text-black dark:text-gray-100">客戶</label>
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
                  className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2 text-base text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
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
                        <div className={`text-sm font-semibold ${
                          customer.store_credit >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          ${customer.store_credit?.toFixed(2) || '0.00'}
                        </div>
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

              {/* 显示选中客户的购物金余额 */}
              {selectedCustomer && (
                <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">購物金餘額</span>
                    <span className={`text-lg font-bold ${
                      selectedCustomer.store_credit >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      ${selectedCustomer.store_credit?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  {selectedCustomer.credit_limit > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-600 dark:text-gray-400">信用額度</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        ${selectedCustomer.credit_limit.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payment Method - Button Grid */}
            <div>
              <label className="block font-bold mb-1.5 text-sm text-black dark:text-gray-100">付款方式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setPaymentMethod('cash')
                    setIsPaid(true)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💵 現金
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('card')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'card'
                      ? 'bg-blue-400 border-blue-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💳 刷卡
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transfer_cathay')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'transfer_cathay'
                      ? 'bg-purple-400 border-purple-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 國泰
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transfer_fubon')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'transfer_fubon'
                      ? 'bg-red-400 border-red-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 富邦
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transfer_esun')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'transfer_esun'
                      ? 'bg-green-400 border-green-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 玉山
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transfer_union')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'transfer_union'
                      ? 'bg-orange-400 border-orange-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  🏦 聯邦
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('transfer_linepay')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'transfer_linepay'
                      ? 'bg-green-400 border-green-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  💚 LINE Pay
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('cod')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'cod'
                      ? 'bg-pink-400 border-pink-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  📦 貨到付款
                </button>
                <button
                  onClick={() => {
                    setPaymentMethod('pending')
                    setIsPaid(false)
                  }}
                  className={`py-2.5 px-3 rounded-lg font-bold text-sm border-2 transition-all ${
                    paymentMethod === 'pending'
                      ? 'bg-gray-400 border-gray-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  ❓ 待確定
                </button>
              </div>
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
                  className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${
                    discountType === 'none'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  無折扣
                </button>
                <button
                  onClick={() => setDiscountType('percent')}
                  className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${
                    discountType === 'percent'
                      ? 'bg-yellow-400 border-yellow-600 text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-700 border-gray-400 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  百分比
                </button>
                <button
                  onClick={() => setDiscountType('amount')}
                  className={`py-2 rounded-lg font-bold text-sm border-2 transition-all ${
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
                  className="w-full border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2 text-base text-black dark:text-gray-100 bg-white dark:bg-gray-700 focus:border-black dark:focus:border-blue-500 focus:outline-none"
                  placeholder={discountType === 'percent' ? '折扣 %' : '折扣金額'}
                />
              )}
            </div>

            {/* Payment Status */}
            <label className="flex items-center gap-2.5 cursor-pointer border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={isPaid}
                onChange={(e) => setIsPaid(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="font-bold text-base text-black dark:text-gray-100">已收款</span>
            </label>

            {/* Delivery Status */}
            <label className="flex items-center gap-2.5 cursor-pointer border-2 border-gray-400 dark:border-gray-600 rounded-lg px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700">
              <input
                type="checkbox"
                checked={isDelivered}
                onChange={(e) => setIsDelivered(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="font-bold text-base text-black dark:text-gray-100">已出貨</span>
            </label>
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



          {/* Checkout Button - Fixed at bottom */}
          <div className="p-3 border-t-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex gap-2">
              <button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-bold text-lg py-3 rounded-lg shadow-md transition-all active:scale-95 disabled:cursor-not-allowed border-2 border-green-600 disabled:border-gray-500 dark:disabled:border-gray-600"
              >
                {loading ? '處理中...' : '結帳'}
              </button>
              {cart.length > 0 && (
                <button
                  onClick={handleSaveDraft}
                  disabled={loading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-bold text-lg py-3 rounded-lg shadow-md transition-all active:scale-95 disabled:cursor-not-allowed border-2 border-orange-600 disabled:border-gray-500"
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
            <div className="bg-blue-500 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
              <h2 className="text-xl font-bold">今日交易</h2>
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
      </div>
    </>
  )
}
