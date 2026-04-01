import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Extension, TabRegistration, NewTabMenuItem } from '../extensions/types'

// We need fresh registry instances, so we use dynamic imports with module resets
describe('ExtensionRegistry', () => {
  async function freshRegistry() {
    vi.resetModules()
    const mod = await import('../extensions/registry')
    return mod.extensionRegistry
  }

  // Minimal extension stubs
  const DummyIcon = () => null
  const DummyComponent = () => null

  function makeExtension(overrides: Partial<Extension> = {}): Extension {
    return {
      id: 'test-ext',
      name: 'Test Extension',
      ...overrides,
    }
  }

  function makeTabRegistration(overrides: Partial<TabRegistration> = {}): TabRegistration {
    return {
      type: 'test-tab',
      label: 'Test Tab',
      icon: DummyIcon as any,
      component: DummyComponent as any,
      ...overrides,
    }
  }

  describe('register', () => {
    it('registers an extension', async () => {
      const registry = await freshRegistry()
      const ext = makeExtension()
      registry.register(ext)
      expect(registry.getExtension('test-ext')).toBe(ext)
    })

    it('skips duplicate registration', async () => {
      const registry = await freshRegistry()
      const ext1 = makeExtension({ name: 'First' })
      const ext2 = makeExtension({ name: 'Second' })
      registry.register(ext1)
      registry.register(ext2)
      expect(registry.getExtension('test-ext')?.name).toBe('First')
    })

    it('calls onActivate when registering', async () => {
      const registry = await freshRegistry()
      const onActivate = vi.fn()
      registry.register(makeExtension({ onActivate }))
      expect(onActivate).toHaveBeenCalledOnce()
    })

    it('does not call onActivate when extension is disabled', async () => {
      const registry = await freshRegistry()
      const onActivate = vi.fn()
      registry.hydrateDisabled(['test-ext'])
      registry.register(makeExtension({ onActivate }))
      expect(onActivate).not.toHaveBeenCalled()
    })

    it('registers tab types from extension', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'my-tab' })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabRegistration('my-tab')).toBe(tab)
    })

    it('marks extension as builtin by default', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension())
      expect(registry.isBuiltin('test-ext')).toBe(true)
    })

    it('can register non-builtin extension', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension(), false)
      expect(registry.isBuiltin('test-ext')).toBe(false)
    })
  })

  describe('enable/disable', () => {
    it('extensions are enabled by default', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension())
      expect(registry.isEnabled('test-ext')).toBe(true)
    })

    it('setEnabled(false) disables extension', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({ tabs: [makeTabRegistration()] }))
      registry.setEnabled('test-ext', false)
      expect(registry.isEnabled('test-ext')).toBe(false)
    })

    it('disabling removes tab types', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({ tabs: [makeTabRegistration({ type: 'my-tab' })] }))
      registry.setEnabled('test-ext', false)
      expect(registry.getTabRegistration('my-tab')).toBeUndefined()
    })

    it('re-enabling restores tab types and calls onActivate', async () => {
      const registry = await freshRegistry()
      const onActivate = vi.fn()
      registry.register(makeExtension({
        tabs: [makeTabRegistration({ type: 'my-tab' })],
        onActivate,
      }))
      onActivate.mockClear()
      registry.setEnabled('test-ext', false)
      registry.setEnabled('test-ext', true)
      expect(registry.getTabRegistration('my-tab')).toBeDefined()
      expect(onActivate).toHaveBeenCalledOnce()
    })

    it('hydrateDisabled sets initial disabled list', async () => {
      const registry = await freshRegistry()
      registry.hydrateDisabled(['ext-a', 'ext-b'])
      registry.register(makeExtension({ id: 'ext-a', name: 'A' }))
      registry.register(makeExtension({ id: 'ext-c', name: 'C' }))
      expect(registry.isEnabled('ext-a')).toBe(false)
      expect(registry.isEnabled('ext-c')).toBe(true)
    })
  })

  describe('getAllExtensions / getEnabledExtensions', () => {
    it('getAllExtensions returns all registered', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({ id: 'a', name: 'A' }))
      registry.register(makeExtension({ id: 'b', name: 'B' }))
      expect(registry.getAllExtensions()).toHaveLength(2)
    })

    it('getEnabledExtensions filters out disabled', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({ id: 'a', name: 'A' }))
      registry.register(makeExtension({ id: 'b', name: 'B' }))
      registry.setEnabled('a', false)
      const enabled = registry.getEnabledExtensions()
      expect(enabled).toHaveLength(1)
      expect(enabled[0].id).toBe('b')
    })
  })

  describe('getSidebarExtensions', () => {
    it('returns extensions with icon and sidebar', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({
        id: 'with-sidebar',
        icon: DummyIcon as any,
        sidebar: DummyComponent as any,
      }))
      registry.register(makeExtension({ id: 'no-sidebar', name: 'No Sidebar' }))
      const sidebars = registry.getSidebarExtensions()
      expect(sidebars).toHaveLength(1)
      expect(sidebars[0].id).toBe('with-sidebar')
    })
  })

  describe('getSettingsPanels', () => {
    it('returns extensions with settingsPanel', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({
        id: 'with-settings',
        settingsPanel: DummyComponent as any,
      }))
      registry.register(makeExtension({ id: 'no-settings' }))
      const panels = registry.getSettingsPanels()
      expect(panels).toHaveLength(1)
      expect(panels[0].extension.id).toBe('with-settings')
    })
  })

  describe('tab operations', () => {
    it('getTabComponent returns component for type', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'editor', component: DummyComponent as any })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabComponent('editor')).toBe(DummyComponent)
    })

    it('getTabIcon returns icon for type', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'editor', icon: DummyIcon as any })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabIcon('editor')).toBe(DummyIcon)
    })

    it('getTabIconClassName returns className', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'editor', iconClassName: 'w-3 h-3' })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabIconClassName('editor')).toBe('w-3 h-3')
    })

    it('returns undefined for unknown tab type', async () => {
      const registry = await freshRegistry()
      expect(registry.getTabRegistration('unknown')).toBeUndefined()
      expect(registry.getTabComponent('unknown')).toBeUndefined()
      expect(registry.getTabIcon('unknown')).toBeUndefined()
    })
  })

  describe('file extension mapping', () => {
    it('maps file extension to tab type', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({
        type: 'image-viewer',
        fileExtensions: ['.png', '.jpg', '.gif'],
      })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabTypeForFile('photo.png')).toBe('image-viewer')
      expect(registry.getTabTypeForFile('photo.jpg')).toBe('image-viewer')
      expect(registry.getTabTypeForFile('animation.gif')).toBe('image-viewer')
    })

    it('is case insensitive', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'image', fileExtensions: ['.PNG'] })
      registry.register(makeExtension({ tabs: [tab] }))
      expect(registry.getTabTypeForFile('photo.png')).toBe('image')
    })

    it('returns text for unknown extensions', async () => {
      const registry = await freshRegistry()
      expect(registry.getTabTypeForFile('readme.xyz')).toBe('text')
    })

    it('returns text for files with no extension', async () => {
      const registry = await freshRegistry()
      expect(registry.getTabTypeForFile('Makefile')).toBe('text')
    })

    it('removes file mappings when extension is disabled', async () => {
      const registry = await freshRegistry()
      const tab = makeTabRegistration({ type: 'image', fileExtensions: ['.png'] })
      registry.register(makeExtension({ tabs: [tab] }))
      registry.setEnabled('test-ext', false)
      expect(registry.getTabTypeForFile('photo.png')).toBe('text')
    })
  })

  describe('getNewTabMenuItems', () => {
    it('returns menu items from enabled extensions', async () => {
      const registry = await freshRegistry()
      const menuItem: NewTabMenuItem = {
        label: 'New Terminal',
        icon: DummyIcon as any,
        action: vi.fn(),
      }
      registry.register(makeExtension({ newTabMenuItems: [menuItem] }))
      const items = registry.getNewTabMenuItems()
      expect(items).toHaveLength(1)
      expect(items[0].label).toBe('New Terminal')
    })

    it('excludes menu items from disabled extensions', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({
        newTabMenuItems: [{ label: 'Item', icon: DummyIcon as any, action: vi.fn() }],
      }))
      registry.setEnabled('test-ext', false)
      expect(registry.getNewTabMenuItems()).toHaveLength(0)
    })

    it('combines items from multiple extensions', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension({
        id: 'ext-a',
        newTabMenuItems: [{ label: 'A', icon: DummyIcon as any, action: vi.fn() }],
      }))
      registry.register(makeExtension({
        id: 'ext-b',
        newTabMenuItems: [{ label: 'B', icon: DummyIcon as any, action: vi.fn() }],
      }))
      expect(registry.getNewTabMenuItems()).toHaveLength(2)
    })
  })

  describe('subscribe', () => {
    it('notifies listeners when extensions are enabled/disabled', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension())
      const listener = vi.fn()
      registry.subscribe(listener)
      registry.setEnabled('test-ext', false)
      expect(listener).toHaveBeenCalledOnce()
    })

    it('returns unsubscribe function', async () => {
      const registry = await freshRegistry()
      registry.register(makeExtension())
      const listener = vi.fn()
      const unsub = registry.subscribe(listener)
      unsub()
      registry.setEnabled('test-ext', false)
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
