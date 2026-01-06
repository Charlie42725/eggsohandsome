import { z } from 'zod'

// Product schemas
export const productSchema = z.object({
  item_code: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  barcode: z.string().optional().nullable(),
  price: z.number().min(0, 'Price must be positive').default(0),
  cost: z.number().min(0, 'Cost must be positive').default(0),
  unit: z.string().default('件'),
  tags: z.array(z.string()).default([]),
  stock: z.number().min(0, 'Stock cannot be negative').default(0),
  allow_negative: z.boolean().default(true),
  is_active: z.boolean().default(true),
})

// Update schema excludes stock (managed via inventory operations only)
export const productUpdateSchema = productSchema
  .omit({ stock: true })
  .partial()

// Customer schemas
export const customerSchema = z.object({
  customer_code: z.string().optional(),
  customer_name: z.string().min(1, 'Customer name is required'),
  phone: z.string().optional().nullable(),
  line_id: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

// Vendor schemas
export const vendorSchema = z.object({
  vendor_code: z.string().optional(),
  vendor_name: z.string().min(1, 'Vendor name is required'),
  contact_person: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  bank_account: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

// Sale schemas
export const saleDraftSchema = z.object({
  customer_code: z.string().optional(),
  source: z.enum(['pos', 'live', 'manual']).default('pos'),
  payment_method: z.enum([
    'cash',
    'card',
    'transfer_cathay',
    'transfer_fubon',
    'transfer_esun',
    'transfer_union',
    'transfer_linepay',
    'cod'
  ]).default('cash'),
  is_paid: z.boolean().default(false),
  note: z.string().optional(),
  discount_type: z.enum(['none', 'percent', 'amount']).default('none'),
  discount_value: z.number().min(0, 'Discount must be positive').default(0),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().positive('Quantity must be positive'),
      price: z.number().min(0, 'Price must be positive'),
    })
  ).min(1, 'At least one item is required'),
})

// Purchase schemas
export const purchaseDraftSchema = z.object({
  vendor_code: z.string().min(1, 'Vendor is required'),
  is_paid: z.boolean().default(false),
  note: z.string().optional(),
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      quantity: z.number().int().positive('Quantity must be positive'),
      cost: z.number().min(0, 'Cost must be positive'),
    })
  ).min(1, 'At least one item is required'),
})

// Settlement schemas
export const settlementSchema = z.object({
  partner_type: z.enum(['customer', 'vendor']),
  partner_code: z.string().min(1, 'Partner code is required'),
  direction: z.enum(['receipt', 'payment']),
  method: z.enum([
    'cash',
    'card',
    'transfer_cathay',
    'transfer_fubon',
    'transfer_esun',
    'transfer_union',
    'transfer_linepay',
    'cod'
  ]).optional(),
  amount: z.number().positive('Amount must be positive'),
  note: z.string().optional(),
  allocations: z.array(
    z.object({
      partner_account_id: z.string().uuid(),
      amount: z.number().positive('Amount must be positive'),
    })
  ).min(1, 'At least one allocation is required'),
})
