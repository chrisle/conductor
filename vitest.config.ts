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
      '@kanban-extension/types': resolve(__dirname, '../kanban-extension/src/types.ts'),
      '@kanban-extension/providers/jira/jira-provider': resolve(__dirname, '../kanban-extension/src/providers/jira/jira-provider.ts'),
      '@kanban-extension/providers/jira/jira-api': resolve(__dirname, '../kanban-extension/src/providers/jira/jira-api.ts'),
      '@kanban-extension/providers/provider': resolve(__dirname, '../kanban-extension/src/providers/provider.ts'),
      '@kanban-extension/TicketCard': resolve(__dirname, '../kanban-extension/src/TicketCard.tsx'),
      '@kanban-extension/KanbanColumn': resolve(__dirname, '../kanban-extension/src/KanbanColumn.tsx'),
      '@kanban-extension/KanbanBoard': resolve(__dirname, '../kanban-extension/src/KanbanBoard.tsx'),
      '@kanban-extension/EditTicketDialog': resolve(__dirname, '../kanban-extension/src/EditTicketDialog.tsx'),
      '@kanban-extension': resolve(__dirname, '../kanban-extension/src/index.ts')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**']
  }
})
