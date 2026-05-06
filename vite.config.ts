import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Vite + React + PWA. PWA-Setup ist bewusst minimal: Asset-Caching only,
// kein Background-Sync und kein Offline-Data-Layer (Server-First, siehe
// ARCHITECTURE.md S4). Manifest-Felder sind Platzhalter und werden in
// M7 (PWA-Phase) gefüllt.
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Bewusst KEIN runtime-caching für Supabase-API: Server-First-Modus.
        runtimeCaching: [],
      },
      manifest: {
        name: 'Zeiterfassung',
        short_name: 'Zeiterfassung',
        description: 'Zeiterfassung v3',
        theme_color: '#1c1a17',
        background_color: '#1c1a17',
        display: 'standalone',
        start_url: '.',
        icons: [],
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
