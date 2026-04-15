import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve('src'),
      '@': resolve('src'),
      '@conductor/extension-sdk': resolve('../conductor-extension-sdk/src/index.ts')
    }
  },
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      input: resolve('index.html')
    }
  }
})
