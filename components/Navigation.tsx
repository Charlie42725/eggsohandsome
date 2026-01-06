'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: '首頁' },
  { href: '/dashboard', label: '營收報表' },
  { href: '/pos', label: 'POS 收銀' },
  { href: '/products', label: '商品庫' },
  { href: '/ichiban-kuji', label: '一番賞庫' },
  { href: '/vendors', label: '廠商管理' },
  { href: '/customers', label: '客戶管理' },
  { href: '/purchases', label: '進貨管理' },
  { href: '/sales', label: '銷售記錄' },
  { href: '/ar', label: '應收帳款' },
  { href: '/ap', label: '應付帳款' },
]

export default function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.jpg"
                alt="ToyFlow ERP Logo"
                width={40}
                height={40}
                className="rounded"
              />
              <span className="text-xl font-bold text-blue-600">失控 ERP</span>
            </Link>
            <div className="flex gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
