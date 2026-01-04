// Core types
export type Product = {
  id: string
  item_code: string
  barcode?: string | null
  name: string
  unit: string
  price: number
  cost: number
  stock: number
  avg_cost: number
  allow_negative: boolean
  is_active: boolean
  tags: string[]
  image_url?: string | null
}

export type Customer = {
  id: string
  customer_code: string
  customer_name: string
  phone?: string | null
  line_id?: string | null
  email?: string | null
  address?: string | null
  payment_method?: string | null
  note?: string | null
  is_active: boolean
}

export type Vendor = {
  id: string
  vendor_code: string
  vendor_name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  payment_terms?: string | null
  bank_account?: string | null
  note?: string | null
  is_active: boolean
}

export type SaleItem = {
  product_id: string
  quantity: number
  price: number
}

export type SaleDraft = {
  customer_code?: string
  source: 'pos' | 'live' | 'manual'
  payment_method: 'cash' | 'card' | 'transfer' | 'cod'
  is_paid: boolean
  items: SaleItem[]
  note?: string
}

export type PurchaseItem = {
  product_id: string
  quantity: number
  cost: number
}

export type PurchaseDraft = {
  vendor_code: string
  items: PurchaseItem[]
  note?: string
}

// API Response types
export type ApiResponse<T = unknown> = {
  ok: boolean
  data?: T
  error?: string
}
