import type { Extension, TabRegistration, NewTabMenuItem } from './types'

class ExtensionRegistry {
  private extensions: Map<string, Extension> = new Map()
  private tabTypes: Map<string, TabRegistration> = new Map()
  private fileExtMap: Map<string, string> = new Map()

  register(extension: Extension): void {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension "${extension.id}" already registered, skipping.`)
      return
    }
    this.extensions.set(extension.id, extension)

    if (extension.tabs) {
      for (const tab of extension.tabs) {
        if (this.tabTypes.has(tab.type)) {
          console.warn(`Tab type "${tab.type}" already registered by another extension.`)
        }
        this.tabTypes.set(tab.type, tab)

        if (tab.fileExtensions) {
          for (const ext of tab.fileExtensions) {
            this.fileExtMap.set(ext.toLowerCase(), tab.type)
          }
        }
      }
    }

    extension.onActivate?.()
  }

  getExtension(id: string): Extension | undefined {
    return this.extensions.get(id)
  }

  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values())
  }

  getSidebarExtensions(): Extension[] {
    return this.getAllExtensions().filter(p => p.icon && p.sidebar)
  }

  getTabRegistration(type: string): TabRegistration | undefined {
    return this.tabTypes.get(type)
  }

  getTabComponent(type: string): TabRegistration['component'] | undefined {
    return this.tabTypes.get(type)?.component
  }

  getTabIcon(type: string): TabRegistration['icon'] | undefined {
    return this.tabTypes.get(type)?.icon
  }

  getTabIconClassName(type: string): string | undefined {
    return this.tabTypes.get(type)?.iconClassName
  }

  getTabTypeForFile(filename: string): string {
    const ext = '.' + (filename.split('.').pop()?.toLowerCase() || '')
    return this.fileExtMap.get(ext) || 'text'
  }

  getNewTabMenuItems(): NewTabMenuItem[] {
    const items: NewTabMenuItem[] = []
    for (const extension of this.extensions.values()) {
      if (extension.newTabMenuItems) {
        items.push(...extension.newTabMenuItems)
      }
    }
    return items
  }
}

export const extensionRegistry = new ExtensionRegistry()
