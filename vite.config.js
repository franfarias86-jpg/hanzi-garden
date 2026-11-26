import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hanzi Garden',
        short_name: 'Hanzi',
        description: 'Your personal Chinese word library, reviews and graded stories.',
        theme_color: '#b23a3a',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['strokes/**', 'data/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/') || url.pathname.includes('/strokes/'),
            handler: 'CacheFirst',
            options: { cacheName: 'hanzi-data', expiration: { maxEntries: 5000 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'raw.githubusercontent.com' || url.hostname === 'cdn.jsdelivr.net',
            handler: 'CacheFirst',
            options: { cacheName: 'hanzi-remote', expiration: { maxEntries: 3000 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
});
