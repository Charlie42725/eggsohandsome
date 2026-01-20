'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'

type ImageUploadProps = {
    productId?: string
    currentImageUrl?: string | null
    onImageChange?: (imageUrl: string | null) => void
    className?: string
}

export default function ImageUpload({
    productId,
    currentImageUrl,
    onImageChange,
    className = ''
}: ImageUploadProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl || null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [dragActive, setDragActive] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Extract filename from URL for deletion
    const getFilenameFromUrl = (url: string): string | null => {
        try {
            const parts = url.split('/')
            return parts[parts.length - 1]
        } catch {
            return null
        }
    }

    const handleUpload = async (file: File) => {
        setError(null)

        // Client-side validation
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            setError('只支援 JPG、PNG、WebP 格式的圖片')
            return
        }

        const maxSize = 5 * 1024 * 1024 // 5MB
        if (file.size > maxSize) {
            setError('圖片大小不能超過 5MB')
            return
        }

        setUploading(true)

        try {
            const formData = new FormData()
            formData.append('image', file)
            if (productId) {
                formData.append('product_id', productId)
            }

            const res = await fetch('/api/products/upload-image', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()

            if (data.ok) {
                setImageUrl(data.data.image_url)
                onImageChange?.(data.data.image_url)
            } else {
                setError(data.error || '上傳失敗')
            }
        } catch (err) {
            setError('上傳失敗，請稍後再試')
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async () => {
        if (!imageUrl) return

        if (!confirm('確定要刪除這張圖片嗎？')) return

        const filename = getFilenameFromUrl(imageUrl)
        if (!filename) {
            setError('無法識別圖片檔案')
            return
        }

        setUploading(true)
        setError(null)

        try {
            const params = new URLSearchParams({ filename })
            if (productId) {
                params.append('product_id', productId)
            }

            const res = await fetch(`/api/products/upload-image?${params}`, {
                method: 'DELETE'
            })

            const data = await res.json()

            if (data.ok) {
                setImageUrl(null)
                onImageChange?.(null)
            } else {
                setError(data.error || '刪除失敗')
            }
        } catch (err) {
            setError('刪除失敗，請稍後再試')
        } finally {
            setUploading(false)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleUpload(file)
        }
    }

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        const file = e.dataTransfer.files?.[0]
        if (file && file.type.startsWith('image/')) {
            handleUpload(file)
        } else {
            setError('請拖放圖片檔案')
        }
    }, [])

    const openFileDialog = () => {
        fileInputRef.current?.click()
    }

    return (
        <div className={`space-y-3 ${className}`}>
            <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                商品圖片
            </label>

            <div className="flex gap-4">
                {/* Image Preview */}
                <div
                    className={`relative w-32 h-32 border-2 rounded-lg overflow-hidden flex items-center justify-center
            ${dragActive
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
                        }
            ${!imageUrl ? 'border-dashed' : 'border-solid'}
          `}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={!imageUrl ? openFileDialog : undefined}
                    style={{ cursor: !imageUrl ? 'pointer' : 'default' }}
                >
                    {uploading ? (
                        <div className="flex flex-col items-center text-gray-500 dark:text-gray-400">
                            <svg className="animate-spin h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span className="text-xs">上傳中...</span>
                        </div>
                    ) : imageUrl ? (
                        <Image
                            src={imageUrl}
                            alt="商品圖片"
                            fill
                            className="object-cover"
                            unoptimized // Use unoptimized for external Supabase URLs
                        />
                    ) : (
                        <div className="flex flex-col items-center text-gray-400 dark:text-gray-500 p-2 text-center">
                            <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs">點擊或拖放</span>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    <button
                        type="button"
                        onClick={openFileDialog}
                        disabled={uploading}
                        className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        選擇圖片
                    </button>

                    {imageUrl && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={uploading}
                            className="px-4 py-2 text-sm rounded border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            刪除圖片
                        </button>
                    )}

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        支援 JPG、PNG、WebP<br />
                        最大 5MB
                    </p>
                </div>
            </div>

            {error && (
                <div className="text-sm text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}
        </div>
    )
}
