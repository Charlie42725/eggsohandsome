import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateCode(prefix: string, count: number): string {
  const num = (count + 1).toString().padStart(4, '0')
  return `${prefix}${num}`
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const hours = String(d.getUTCHours()).padStart(2, '0')
  const minutes = String(d.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function formatPaymentMethod(method: string): string {
  const methodMap: Record<string, string> = {
    'cash': '現金',
    'card': '刷卡',
    'transfer_cathay': '轉帳 - 國泰',
    'transfer_fubon': '轉帳 - 富邦',
    'transfer_esun': '轉帳 - 玉山',
    'transfer_union': '轉帳 - 聯邦',
    'transfer_linepay': '轉帳 - LINE Pay',
    'cod': '貨到付款',
    'pending': '待確定',
    // 兼容舊的 'transfer' 值
    'transfer': '轉帳',
  }
  return methodMap[method] || method
}
