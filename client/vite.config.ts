import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
/*
 * Local development serves the API on the SAME origin as the site, exactly
 * as the Vercel /api rewrite does in production: the browser calls
 * http://localhost:5173/api/… and Vite forwards it to the API server. That
 * is what lets the HttpOnly session cookie work locally (services/http.ts).
 * Override the target with VITE_DEV_API_PROXY if the API runs elsewhere.
 */
const DEV_API_TARGET = process.env.VITE_DEV_API_PROXY ?? 'http://localhost:3001'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: DEV_API_TARGET },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
