import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '蛋要酷ERP',
    short_name: '蛋要酷ERP',
    description: '簡單好用的 ERP 系統',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/logo.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: '/logo.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'any',
      },
      {
        src: '/logo.jpg',
        sizes: '192x192',
        type: 'image/jpeg',
        purpose: 'maskable',
      },
      {
        src: '/logo.jpg',
        sizes: '512x512',
        type: 'image/jpeg',
        purpose: 'maskable',
      },
    ],
  }
}
