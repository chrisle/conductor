import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      '@conductor/extension-sdk': resolve(__dirname, '../conductor-extension-sdk/src/index.ts'),
      '@np3/jira/jira-api': resolve(__dirname, '../np3-jira/src/jira-api.ts'),
      '@np3/jira': resolve(__dirname, '../np3-jira/src/index.ts')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**']
  }
})
