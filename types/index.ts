// Core types
export type Category = {
  id: string
  name: string
  color: string
  sort_order: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

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
  category_id?: string | null
  category?: Category | null
  created_at?: string
  updated_at?: string
}

export type Customer = {
  id: string
  customer_code: string
  customer_name: string
  phone?: string | null
  line_id?: string | null
  store_address?: string | null  // 門市地址
  delivery_address?: string | null  // 宅配地址
  payment_method?: string | null
  note?: string | null
  is_active: boolean
  store_credit: number  // 购物金余额（可为负）
  credit_limit: number  // 信用额度（最大欠款）
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

export type PaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer_cathay'
  | 'transfer_fubon'
  | 'transfer_esun'
  | 'transfer_union'
  | 'transfer_linepay'
  | 'cod'
  | 'pending'

// Account type for dynamic payment methods
export type Account = {
  id: string
  account_name: string
  account_type: 'cash' | 'bank' | 'petty_cash'
  balance: number
  is_active: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type SaleDraft = {
  customer_code?: string
  source: 'pos' | 'live' | 'manual'
  payment_method: PaymentMethod
  is_paid: boolean
  items: SaleItem[]
  note?: string
  discount_type?: 'none' | 'percent' | 'amount'
  discount_value?: number
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

// Ichiban Kuji types
export type IchibanKujiPrize = {
  id?: string
  prize_tier: string
  product_id: string
  quantity: number
}

export type IchibanKuji = {
  id: string
  name: string
  total_draws: number
  avg_cost: number
  price: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type IchibanKujiDraft = {
  name: string
  price: number
  prizes: IchibanKujiPrize[]
}

// Customer balance log types
export type BalanceLogType = 'recharge' | 'deduct' | 'sale' | 'refund' | 'adjustment'

export type CustomerBalanceLog = {
  id: string
  customer_code: string
  amount: number
  balance_before: number
  balance_after: number
  type: BalanceLogType
  ref_type?: string | null
  ref_id?: string | null
  ref_no?: string | null
  note?: string | null
  created_by?: string | null
  created_at: string
  updated_at: string
}

export type BalanceAdjustmentDraft = {
  customer_code: string
  amount: number
  type: 'recharge' | 'deduct' | 'adjustment'
  note?: string
}

// Point system types
export type PointProgram = {
  id: string
  name: string
  spend_per_point: number   // 每多少元得1點
  cost_per_point: number    // 每點預估成本
  is_active: boolean
  created_at?: string
  updated_at?: string
  tiers?: PointRedemptionTier[]  // 兌換方案
}

export type PointRedemptionTier = {
  id: string
  program_id: string
  points_required: number   // 需要點數
  reward_value: number      // 兌換購物金金額
  is_active: boolean
  created_at?: string
}

export type CustomerPoints = {
  id: string
  customer_id: string
  program_id: string
  points: number            // 當前點數
  total_earned: number      // 累計獲得
  total_redeemed: number    // 累計兌換
  estimated_cost: number    // 累計預估成本
  updated_at?: string
  program?: PointProgram    // 關聯的點數計劃
}

export type PointLogType = 'earn' | 'redeem' | 'expire' | 'adjust'

export type PointLog = {
  id: string
  customer_id: string
  program_id: string
  sale_id?: string | null
  change_type: PointLogType
  points_change: number     // 點數變動
  cost_amount: number       // 成本金額
  sale_amount?: number | null   // 消費金額
  reward_value?: number | null  // 兌換價值
  tier_id?: string | null
  note?: string | null
  created_at: string
  program?: PointProgram
}

export type PointRedemptionDraft = {
  customer_id: string
  program_id: string
  tier_id: string           // 使用的兌換方案
  note?: string
}

// API Response types
export type ApiResponse<T = unknown> = {
  ok: boolean
  data?: T
  error?: string
}
