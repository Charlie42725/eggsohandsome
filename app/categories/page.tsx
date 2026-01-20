'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Category } from '@/types'

const DEFAULT_COLORS = [
    '#EF4444', // Red
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#6B7280', // Gray
    '#14B8A6', // Teal
]

export default function CategoriesPage() {
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)

    // Form state
    const [formName, setFormName] = useState('')
    const [formColor, setFormColor] = useState('#3B82F6')
    const [error, setError] = useState('')

    useEffect(() => {
        fetchCategories()
    }, [])

    const fetchCategories = async () => {
        try {
            const res = await fetch('/api/categories')
            const data = await res.json()
            if (data.ok) {
                setCategories(data.data || [])
            }
        } catch (err) {
            console.error('Failed to fetch categories:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleAdd = async () => {
        if (!formName.trim()) {
            setError('請輸入分類名稱')
            return
        }

        setSaving(true)
        setError('')

        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName.trim(),
                    color: formColor,
                    sort_order: categories.length,
                }),
            })

            const data = await res.json()

            if (data.ok) {
                setCategories([...categories, data.data])
                setFormName('')
                setFormColor('#3B82F6')
                setShowAddForm(false)
            } else {
                setError(data.error || '新增失敗')
            }
        } catch (err) {
            setError('新增失敗')
        } finally {
            setSaving(false)
        }
    }

    const handleUpdate = async (id: string) => {
        if (!formName.trim()) {
            setError('請輸入分類名稱')
            return
        }

        setSaving(true)
        setError('')

        try {
            const res = await fetch(`/api/categories/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName.trim(),
                    color: formColor,
                }),
            })

            const data = await res.json()

            if (data.ok) {
                setCategories(categories.map(c => c.id === id ? data.data : c))
                setEditingId(null)
                setFormName('')
                setFormColor('#3B82F6')
            } else {
                setError(data.error || '更新失敗')
            }
        } catch (err) {
            setError('更新失敗')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`確定要刪除分類「${name}」嗎？`)) return

        try {
            const res = await fetch(`/api/categories/${id}`, {
                method: 'DELETE',
            })

            const data = await res.json()

            if (data.ok) {
                setCategories(categories.filter(c => c.id !== id))
            } else {
                alert(data.error || '刪除失敗')
            }
        } catch (err) {
            alert('刪除失敗')
        }
    }

    const startEdit = (category: Category) => {
        setEditingId(category.id)
        setFormName(category.name)
        setFormColor(category.color)
        setShowAddForm(false)
        setError('')
    }

    const cancelEdit = () => {
        setEditingId(null)
        setFormName('')
        setFormColor('#3B82F6')
        setError('')
    }

    const startAdd = () => {
        setShowAddForm(true)
        setEditingId(null)
        setFormName('')
        setFormColor('#3B82F6')
        setError('')
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <div className="mx-auto max-w-3xl">
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">商品分類管理</h1>
                    <Link
                        href="/products"
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                        ← 返回商品庫
                    </Link>
                </div>

                {/* Add New Category */}
                {!showAddForm && !editingId && (
                    <button
                        onClick={startAdd}
                        className="mb-6 w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-4 text-center text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
                    >
                        + 新增分類
                    </button>
                )}

                {/* Add Form */}
                {showAddForm && (
                    <div className="mb-6 rounded-lg bg-white dark:bg-gray-800 p-4 shadow">
                        <h3 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">新增分類</h3>

                        {error && (
                            <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                分類名稱 <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                                placeholder="例如：GK模型、盲盒"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                顏色標籤
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {DEFAULT_COLORS.map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setFormColor(color)}
                                        className={`h-8 w-8 rounded-full border-2 transition-all ${formColor === color
                                                ? 'border-gray-900 dark:border-white scale-110'
                                                : 'border-transparent hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowAddForm(false)}
                                className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAdd}
                                disabled={saving}
                                className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {saving ? '新增中...' : '新增分類'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Categories List */}
                <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">載入中...</div>
                    ) : categories.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            尚無分類，請點擊上方按鈕新增
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {categories.map((category) => (
                                <div key={category.id} className="p-4">
                                    {editingId === category.id ? (
                                        // Edit Mode
                                        <div>
                                            {error && (
                                                <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                                                    {error}
                                                </div>
                                            )}

                                            <div className="mb-4">
                                                <label className="mb-1 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    分類名稱
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formName}
                                                    onChange={(e) => setFormName(e.target.value)}
                                                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-gray-100"
                                                />
                                            </div>

                                            <div className="mb-4">
                                                <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    顏色標籤
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {DEFAULT_COLORS.map((color) => (
                                                        <button
                                                            key={color}
                                                            type="button"
                                                            onClick={() => setFormColor(color)}
                                                            className={`h-8 w-8 rounded-full border-2 transition-all ${formColor === color
                                                                    ? 'border-gray-900 dark:border-white scale-110'
                                                                    : 'border-transparent hover:scale-105'
                                                                }`}
                                                            style={{ backgroundColor: color }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={cancelEdit}
                                                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                                >
                                                    取消
                                                </button>
                                                <button
                                                    onClick={() => handleUpdate(category.id)}
                                                    disabled={saving}
                                                    className="flex-1 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                                                >
                                                    {saving ? '儲存中...' : '儲存'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        // View Mode
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="h-6 w-6 rounded-full"
                                                    style={{ backgroundColor: category.color }}
                                                />
                                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                                    {category.name}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => startEdit(category)}
                                                    className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                                                >
                                                    編輯
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(category.id, category.name)}
                                                    className="rounded px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                                >
                                                    刪除
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
