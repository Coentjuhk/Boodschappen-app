import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const env = (...names: string[]) => names.map((n) => process.env[n]).find(Boolean) ?? '';
// Ook de namen die de Supabase-koppeling van Vercel automatisch invult (alleen publieke sleutels!).
const SUPABASE_URL = env('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const SUPABASE_KEY = env('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_PUBLISHABLE_KEY');

export default defineConfig({
  define: {
    __SUPABASE_URL__: JSON.stringify(SUPABASE_URL),
    __SUPABASE_KEY__: JSON.stringify(SUPABASE_KEY),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Boodschappen',
        short_name: 'Boodschappen',
        description: 'Gedeelde boodschappenlijst met prijzen en aanbiedingen',
        lang: 'nl',
        theme_color: '#1f7a4d',
        background_color: '#f6f5f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
