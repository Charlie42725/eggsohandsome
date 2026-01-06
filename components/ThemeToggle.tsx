'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Check localStorage or system preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initialTheme = savedTheme || systemPreference
    setTheme(initialTheme)
    document.documentElement.classList.toggle('dark', initialTheme === 'dark')
    document.documentElement.classList.toggle('light', initialTheme === 'light')
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="rounded-lg bg-gray-200 p-2 dark:bg-gray-700">
        <span className="text-xl">🌙</span>
      </button>
    )
  }

  return (
    <button
      onClick={toggleTheme}
      className="rounded-lg bg-gray-200 p-2 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      aria-label="切换主题"
    >
      <span className="text-xl">{theme === 'light' ? '🌙' : '☀️'}</span>
    </button>
  )
}
