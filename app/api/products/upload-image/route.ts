import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase/server'

// POST /api/products/upload-image - Upload product image
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('image') as File | null
        const productId = formData.get('product_id') as string | null

        // Validate file exists
        if (!file) {
            return NextResponse.json(
                { ok: false, error: '請選擇圖片檔案' },
                { status: 400 }
            )
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { ok: false, error: '只支援 JPG、PNG、WebP 格式的圖片' },
                { status: 400 }
            )
        }

        // Validate file size (5MB max)
        const maxSize = 5 * 1024 * 1024 // 5MB
        if (file.size > maxSize) {
            return NextResponse.json(
                { ok: false, error: '圖片大小不能超過 5MB' },
                { status: 400 }
            )
        }

        // Generate unique filename
        const ext = file.name.split('.').pop() || 'jpg'
        const timestamp = Date.now()
        const filename = productId
            ? `${productId}_${timestamp}.${ext}`
            : `temp_${timestamp}.${ext}`

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Upload to Supabase Storage
        const { data, error } = await supabaseServer.storage
            .from('product-images')
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: true
            })

        if (error) {
            console.error('Supabase storage upload error:', error)
            return NextResponse.json(
                { ok: false, error: '圖片上傳失敗：' + error.message },
                { status: 500 }
            )
        }

        // Get public URL
        const { data: urlData } = supabaseServer.storage
            .from('product-images')
            .getPublicUrl(filename)

        const imageUrl = urlData.publicUrl

        // If product_id provided, update the product record
        if (productId) {
            const { error: updateError } = await (supabaseServer
                .from('products') as any)
                .update({ image_url: imageUrl })
                .eq('id', productId)

            if (updateError) {
                console.error('Failed to update product image_url:', updateError)
                // Don't fail the upload, just log the error
            }
        }

        return NextResponse.json({
            ok: true,
            data: {
                image_url: imageUrl,
                filename: filename
            }
        })

    } catch (error) {
        console.error('Image upload error:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// DELETE /api/products/upload-image - Delete product image
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const filename = searchParams.get('filename')
        const productId = searchParams.get('product_id')

        if (!filename) {
            return NextResponse.json(
                { ok: false, error: '請提供檔案名稱' },
                { status: 400 }
            )
        }

        // Delete from Supabase Storage
        const { error } = await supabaseServer.storage
            .from('product-images')
            .remove([filename])

        if (error) {
            console.error('Supabase storage delete error:', error)
            return NextResponse.json(
                { ok: false, error: '圖片刪除失敗：' + error.message },
                { status: 500 }
            )
        }

        // If product_id provided, clear the image_url
        if (productId) {
            const { error: updateError } = await (supabaseServer
                .from('products') as any)
                .update({ image_url: null })
                .eq('id', productId)

            if (updateError) {
                console.error('Failed to clear product image_url:', updateError)
            }
        }

        return NextResponse.json({
            ok: true,
            message: '圖片已刪除'
        })

    } catch (error) {
        console.error('Image delete error:', error)
        return NextResponse.json(
            { ok: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
