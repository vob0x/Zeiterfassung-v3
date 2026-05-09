import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Vite + React + PWA. PWA-Setup ist bewusst minimal: Asset-Caching only,
// kein Background-Sync und kein Offline-Data-Layer (Server-First, siehe
// ARCHITECTURE.md S4). Mit M7 ist der App-Shell installable — Manifest +
// Icons sind in /public/icons/ gepflegt, der Service Worker cached die
// JS/CSS/HTML-Assets via globPatterns.
//
// VITE_BASE_PATH erlaubt das Deployen unter <user>.github.io/<repo>/
// in der CI (siehe .github/workflows/deploy.yml). Dev und Preview
// nutzen den Default '/'.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Bewusst KEIN runtime-caching für Supabase-API: Server-First-Modus.
        runtimeCaching: [],
      },
      manifest: {
        name: 'Zeiterfassung',
        short_name: 'Zeiterfassung',
        description: 'E2E-verschlüsselte Zeiterfassung mit Multi-Slot-Timer und Team-Sync.',
        theme_color: '#1c1a17',
        background_color: '#1c1a17',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '.',
        start_url: '.',
        lang: 'de',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
});
