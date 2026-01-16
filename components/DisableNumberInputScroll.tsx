'use client'

import { useEffect } from 'react'

/**
 * 全域禁用 number input 的滾輪事件
 * 防止使用者不小心滾動改變數值
 */
export default function DisableNumberInputScroll() {
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
                target.blur()
            }
        }

        document.addEventListener('wheel', handleWheel, { passive: true })
        return () => document.removeEventListener('wheel', handleWheel)
    }, [])

    return null
}
