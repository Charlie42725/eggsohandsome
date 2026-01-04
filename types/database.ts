export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          item_code: string
          barcode: string | null
          name: string
          unit: string
          cost: number
          price: number
          stock: number
          avg_cost: number
          allow_negative: boolean
          is_active: boolean
          image_url: string | null
          search_text: unknown | null
          tags: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          item_code: string
          barcode?: string | null
          name: string
          unit?: string
          cost?: number
          price?: number
          stock?: number
          avg_cost?: number
          allow_negative?: boolean
          is_active?: boolean
          image_url?: string | null
          search_text?: unknown | null
          tags?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          item_code?: string
          barcode?: string | null
          name?: string
          unit?: string
          cost?: number
          price?: number
          stock?: number
          avg_cost?: number
          allow_negative?: boolean
          is_active?: boolean
          image_url?: string | null
          search_text?: unknown | null
          tags?: Json
          created_at?: string
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          customer_code: string
          customer_name: string
          phone: string | null
          line_id: string | null
          email: string | null
          address: string | null
          payment_method: string | null
          note: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_code: string
          customer_name: string
          phone?: string | null
          line_id?: string | null
          email?: string | null
          address?: string | null
          payment_method?: string | null
          note?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_code?: string
          customer_name?: string
          phone?: string | null
          line_id?: string | null
          email?: string | null
          address?: string | null
          payment_method?: string | null
          note?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      vendors: {
        Row: {
          id: string
          vendor_code: string
          vendor_name: string
          contact_person: string | null
          phone: string | null
          email: string | null
          address: string | null
          payment_terms: string | null
          bank_account: string | null
          note: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vendor_code: string
          vendor_name: string
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          payment_terms?: string | null
          bank_account?: string | null
          note?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vendor_code?: string
          vendor_name?: string
          contact_person?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          payment_terms?: string | null
          bank_account?: string | null
          note?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          sale_no: string
          customer_code: string | null
          sale_date: string
          source: string
          payment_method: string
          is_paid: boolean
          total: number
          status: string
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sale_no: string
          customer_code?: string | null
          sale_date?: string
          source?: string
          payment_method?: string
          is_paid?: boolean
          total?: number
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sale_no?: string
          customer_code?: string | null
          sale_date?: string
          source?: string
          payment_method?: string
          is_paid?: boolean
          total?: number
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity: number
          price: number
          subtotal: number
          snapshot_name: string | null
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity: number
          price: number
          subtotal?: number
          snapshot_name?: string | null
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity?: number
          price?: number
          subtotal?: number
          snapshot_name?: string | null
        }
      }
      purchases: {
        Row: {
          id: string
          purchase_no: string
          vendor_code: string
          purchase_date: string
          total: number
          status: string
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          purchase_no: string
          vendor_code: string
          purchase_date?: string
          total?: number
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          purchase_no?: string
          vendor_code?: string
          purchase_date?: string
          total?: number
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      purchase_items: {
        Row: {
          id: string
          purchase_id: string
          product_id: string
          quantity: number
          cost: number
          subtotal: number
        }
        Insert: {
          id?: string
          purchase_id: string
          product_id: string
          quantity: number
          cost: number
          subtotal?: number
        }
        Update: {
          id?: string
          purchase_id?: string
          product_id?: string
          quantity?: number
          cost?: number
          subtotal?: number
        }
      }
      users: {
        Row: {
          id: string
          username: string
          password_hash: string
          role: string
          full_name: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          password_hash: string
          role?: string
          full_name?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          password_hash?: string
          role?: string
          full_name?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
