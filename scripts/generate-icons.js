const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const inputFile = path.join(__dirname, '../public/logo.jpg')
const outputDir = path.join(__dirname, '../public')

async function generateIcons() {
  console.log('開始生成 PWA 圖標...\n')

  const sizes = [
    { size: 192, name: 'icon-192.png', padding: 0 },
    { size: 512, name: 'icon-512.png', padding: 0 },
    { size: 192, name: 'icon-192-maskable.png', padding: 20 },
    { size: 512, name: 'icon-512-maskable.png', padding: 50 },
  ]

  for (const { size, name, padding } of sizes) {
    const outputPath = path.join(outputDir, name)
    const contentSize = size - padding * 2

    try {
      if (padding > 0) {
        // Maskable 圖標（有 padding）
        await sharp(inputFile)
          .resize(contentSize, contentSize, { 
            fit: 'contain', 
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .extend({
            top: padding,
            bottom: padding,
            left: padding,
            right: padding,
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toFile(outputPath)
      } else {
        // 普通圖標
        await sharp(inputFile)
          .resize(size, size, { 
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toFile(outputPath)
      }
      console.log(`✓ 生成 ${name} (${size}x${size})`)
    } catch (error) {
      console.error(`✗ 生成 ${name} 失敗:`, error.message)
    }
  }

  console.log('\n所有圖標生成完成！')
}

generateIcons().catch(console.error)
