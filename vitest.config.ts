import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'lucide-react': resolve(__dirname, 'node_modules/lucide-react'),
      '@': resolve(__dirname, 'src'),
      '@renderer': resolve(__dirname, 'src'),
      '@conductor/extension-sdk': resolve(__dirname, '../conductor-extension-sdk/src/index.ts'),
      '@conductor/extension-api': resolve(__dirname, 'src/__tests__/extension-api-shim.ts'),
      '@np3/jira/jira-api': resolve(__dirname, '../np3-jira/src/jira-api.ts'),
      '@np3/jira/TicketCard': resolve(__dirname, '../np3-jira/src/TicketCard.tsx'),
      '@np3/jira/KanbanColumn': resolve(__dirname, '../np3-jira/src/KanbanColumn.tsx'),
      '@np3/jira/KanbanBoard': resolve(__dirname, '../np3-jira/src/KanbanBoard.tsx'),
      '@np3/jira/EditTicketDialog': resolve(__dirname, '../np3-jira/src/EditTicketDialog.tsx'),
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
