import { extensionRegistry } from './registry'
import { terminalExtension } from './terminal'
import { aiCliExtension } from './ai-cli'
import { browserExtension } from './browser'
import { fileExplorerExtension } from './file-explorer'
import { projectExtension } from './project'
import { settingsExtension } from './settings'
import { workSessionsExtension } from './work-sessions'
import { notificationsExtension } from './notifications'

export function initializeExtensions(): void {
  // Registration order determines activity bar icon order and Cmd+N shortcuts.
  // Sidebar extensions (icon + sidebar panel) appear in the activity bar:
  //   1. Sessions  2. Explorer  3. Notifications
  // Tab-only extensions follow (no sidebar, no activity bar icon).
  extensionRegistry.register(workSessionsExtension)
  extensionRegistry.register(fileExplorerExtension)
  extensionRegistry.register(notificationsExtension)
  extensionRegistry.register(aiCliExtension)
  extensionRegistry.register(terminalExtension)
  extensionRegistry.register(browserExtension)
  extensionRegistry.register(projectExtension)
  extensionRegistry.register(settingsExtension)
}

export { extensionRegistry } from './registry'
export type { Extension, TabRegistration, TabProps, NewTabMenuItem } from './types'
