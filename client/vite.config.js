import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache everything the app needs to work offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
        // cities.json is large — runtime cache it with a long TTL
        runtimeCaching: [
          {
            urlPattern: /\/src\/data\/cities\.json/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cities-data',
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      manifest: false, // we already have public/manifest.json
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
