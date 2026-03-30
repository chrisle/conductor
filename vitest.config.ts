import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      '@conductor/extension-sdk': resolve(__dirname, 'packages/conductor-extension-sdk/src/index.ts'),
      '@np3/jira': resolve(__dirname, 'packages/np3-jira/src/index.ts')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**']
  }
})
