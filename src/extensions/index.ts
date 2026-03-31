import { extensionRegistry } from './registry'
import { terminalExtension } from './terminal'
import { aiCliExtension } from './ai-cli'
import { browserExtension } from './browser'
import { fileExplorerExtension } from './file-explorer'
import { projectExtension } from './project'
import { settingsExtension } from './settings'
import { workSessionsExtension } from './work-sessions'

export function initializeExtensions(): void {
  // Registration order determines menu item order and activity bar icon order
  extensionRegistry.register(projectExtension)
  extensionRegistry.register(workSessionsExtension)
  extensionRegistry.register(aiCliExtension)
  extensionRegistry.register(fileExplorerExtension)
  extensionRegistry.register(terminalExtension)
  extensionRegistry.register(browserExtension)
  extensionRegistry.register(settingsExtension)
}

export { extensionRegistry } from './registry'
export type { Extension, TabRegistration, TabProps, NewTabMenuItem } from './types'
