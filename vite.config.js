import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2015',
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['tesseract.js'],
  },
})