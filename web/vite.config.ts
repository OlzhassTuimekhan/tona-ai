import path from 'node:path'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** HTTPS в dev — иначе по http://<LAN-IP> нет navigator.mediaDevices (микрофон). */
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    /** Слушать 0.0.0.0 — удобно тестировать микрофон с телефона в той же сети по https://<ваш-ip>:5173 */
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
