'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'

const navItems = [
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
  { href: '/expenses', label: '會計記帳' },
]

export default function Navigation() {
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <nav className="border-b bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4 md:gap-8">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.jpg"
                alt="ToyFlow ERP Logo"
                width={40}
                height={40}
                className="rounded"
              />
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">失控 ERP</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden gap-2 lg:flex xl:gap-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded px-2 py-2 text-sm font-medium transition-colors xl:px-3 ${
                    pathname === item.href
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="rounded-lg p-2 text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700 lg:hidden"
              aria-label="切換選單"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="border-t pb-4 pt-2 dark:border-gray-700 lg:hidden">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
