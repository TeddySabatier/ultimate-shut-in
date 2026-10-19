/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// `base: './'` keeps every asset URL relative so the build works when served
// from a sub-path (GitHub Pages: https://<user>.github.io/<repo>/).
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      injectRegister: false, // we register manually in src/pwa/registerSW.ts
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        id: './',
        name: 'Haven Protocol',
        short_name: 'Haven',
        description:
          'A habit RPG. Go out. Come home. The Haven grows.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f0f14',
        background_color: '#0f0f14',
        lang: 'en',
        categories: ['games', 'lifestyle', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the app icon. Hash routes: the app is a HashRouter, so these stay inside `scope`.
        shortcuts: [
          {
            name: 'Add my own quest',
            short_name: 'Add quest',
            description: 'Write a quest of your own',
            url: './#/quests?compose=1',
            icons: [{ src: 'icons/shortcut-compose.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: "Today's board",
            short_name: 'Board',
            description: "Open today's board",
            url: './#/quests',
            icons: [{ src: 'icons/shortcut-board.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Map',
            short_name: 'Map',
            description: 'Open the map of your city',
            url: './#/map',
            icons: [{ src: 'icons/shortcut-map.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        // notificationclick for reminders (focus or open the app); see public/sw-notify.js.
        importScripts: ['sw-notify.js'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts font files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    pool: 'threads',
    isolate: false,
  },
});
