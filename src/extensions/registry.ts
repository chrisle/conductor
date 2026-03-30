import type { Extension, TabRegistration, NewTabMenuItem } from './types'
import { useConfigStore } from '@/store/config'

class ExtensionRegistry {
  private extensions: Map<string, Extension> = new Map()
  private builtinIds: Set<string> = new Set()
  private tabTypes: Map<string, TabRegistration> = new Map()
  private fileExtMap: Map<string, string> = new Map()
  private disabledIds: Set<string> = new Set()
  private listeners: Set<() => void> = new Set()

  register(extension: Extension, builtin = true): void {
    if (this.extensions.has(extension.id)) {
      console.warn(`Extension "${extension.id}" already registered, skipping.`)
      return
    }
    this.extensions.set(extension.id, extension)
    if (builtin) this.builtinIds.add(extension.id)

    if (!this.disabledIds.has(extension.id)) {
      this.registerTabs(extension)
      extension.onActivate?.()
    }
  }

  private registerTabs(extension: Extension): void {
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
  }

  private unregisterTabs(extension: Extension): void {
    if (extension.tabs) {
      for (const tab of extension.tabs) {
        this.tabTypes.delete(tab.type)
        if (tab.fileExtensions) {
          for (const ext of tab.fileExtensions) {
            if (this.fileExtMap.get(ext.toLowerCase()) === tab.type) {
              this.fileExtMap.delete(ext.toLowerCase())
            }
          }
        }
      }
    }
  }

  hydrateDisabled(disabled: string[]): void {
    this.disabledIds = new Set(disabled)
  }

  isBuiltin(id: string): boolean {
    return this.builtinIds.has(id)
  }

  isEnabled(id: string): boolean {
    return !this.disabledIds.has(id)
  }

  setEnabled(id: string, enabled: boolean): void {
    const ext = this.extensions.get(id)
    if (!ext) return

    if (enabled) {
      this.disabledIds.delete(id)
      this.registerTabs(ext)
      ext.onActivate?.()
    } else {
      this.disabledIds.add(id)
      this.unregisterTabs(ext)
    }
    useConfigStore.getState().setDisabledExtensions([...this.disabledIds])
    this.notifyListeners()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener()
  }

  getExtension(id: string): Extension | undefined {
    return this.extensions.get(id)
  }

  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values())
  }

  getEnabledExtensions(): Extension[] {
    return this.getAllExtensions().filter(e => !this.disabledIds.has(e.id))
  }

  getSidebarExtensions(): Extension[] {
    return this.getEnabledExtensions().filter(p => p.icon && p.sidebar)
  }

  getSettingsPanels(): { extension: Extension; panel: NonNullable<Extension['settingsPanel']> }[] {
    return this.getEnabledExtensions()
      .filter(e => e.settingsPanel)
      .map(e => ({ extension: e, panel: e.settingsPanel! }))
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
      if (!this.disabledIds.has(extension.id) && extension.newTabMenuItems) {
        items.push(...extension.newTabMenuItems)
      }
    }
    return items
  }
}

export const extensionRegistry = new ExtensionRegistry()

// Hydrate disabled extensions from config store once ready
useConfigStore.subscribe((state) => {
  if (state.ready) {
    extensionRegistry.hydrateDisabled(state.config.extensions.disabled)
  }
})
