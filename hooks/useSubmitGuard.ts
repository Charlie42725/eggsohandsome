'use client'

import { useState, useCallback } from 'react'

/**
 * 防止表單重複提交的 Hook
 * 使用方式：
 * const { isSubmitting, withSubmitGuard } = useSubmitGuard()
 * 
 * // 在 onSubmit 中使用
 * const handleSubmit = withSubmitGuard(async (e) => {
 *   // 你的提交邏輯
 * })
 * 
 * // 在按鈕中使用
 * <button type="submit" disabled={isSubmitting}>
 *   {isSubmitting ? '處理中...' : '提交'}
 * </button>
 */
export function useSubmitGuard() {
    const [isSubmitting, setIsSubmitting] = useState(false)

    const withSubmitGuard = useCallback(
        <T extends (...args: any[]) => Promise<any>>(fn: T) => {
            return async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
                if (isSubmitting) {
                    console.warn('表單正在提交中，請勿重複點擊')
                    return undefined
                }

                setIsSubmitting(true)
                try {
                    return await fn(...args)
                } finally {
                    setIsSubmitting(false)
                }
            }
        },
        [isSubmitting]
    )

    const startSubmitting = useCallback(() => setIsSubmitting(true), [])
    const stopSubmitting = useCallback(() => setIsSubmitting(false), [])

    return {
        isSubmitting,
        withSubmitGuard,
        startSubmitting,
        stopSubmitting,
        // 簡易的 guard 檢查
        guardSubmit: useCallback(() => {
            if (isSubmitting) return false
            setIsSubmitting(true)
            return true
        }, [isSubmitting]),
    }
}

export default useSubmitGuard
