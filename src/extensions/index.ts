import { extensionRegistry } from './registry'
import { terminalExtension } from './terminal'
import { claudeExtension } from './claude'
import { browserExtension } from './browser'
import { fileExplorerExtension } from './file-explorer'
import { projectExtension } from './project'
import { extensionsManagerExtension } from './extensions'

export function initializeExtensions(): void {
  // Registration order determines menu item order and activity bar icon order
  extensionRegistry.register(projectExtension)
  extensionRegistry.register(terminalExtension)
  extensionRegistry.register(claudeExtension)
  extensionRegistry.register(browserExtension)
  extensionRegistry.register(fileExplorerExtension)
  extensionRegistry.register(extensionsManagerExtension)
}

export { extensionRegistry } from './registry'
export type { Extension, TabRegistration, TabProps, NewTabMenuItem } from './types'
