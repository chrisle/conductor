import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, loadKitchenSinkExtension } from './helpers'

test.describe('Extension Loading & Unloading', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  // ── Registration ─────────────────────────────────────────────────────────

  test('loads extension and registers it in the registry', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    const ext = await page.evaluate(() => {
      const reg = (window as any).__stores__.extensionRegistry
      const e = reg.getExtension('kitchen-sink-test')
      return e ? { id: e.id, name: e.name, version: e.version, description: e.description } : null
    })

    expect(ext).not.toBeNull()
    expect(ext!.id).toBe('kitchen-sink-test')
    expect(ext!.name).toBe('Kitchen Sink Test')
    expect(ext!.version).toBe('1.0.0')
    expect(ext!.description).toBe('Test extension exercising all SDK features')
  })

  test('onActivate fires when extension is loaded', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    const count = await page.evaluate(() => (window as any).__kitchenSinkActivated__)
    expect(count).toBe(1)
  })

  // ── Activity Bar & Sidebar ───────────────────────────────────────────────

  test('extension appears in the activity bar', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Verify the extension is included in sidebar extensions (which drive the activity bar)
    const sidebarIds = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getSidebarExtensions()
        .map((e: any) => e.id)
    })
    expect(sidebarIds).toContain('kitchen-sink-test')

    // Verify the activity bar re-rendered with the extension's button by
    // toggling it and checking the sidebar appears
    await page.evaluate(() => {
      (window as any).__stores__.activityBar.getState().toggleExtension('kitchen-sink-test')
    })
    await expect(page.locator('[data-testid="ks-sidebar"]')).toBeVisible({ timeout: 3000 })
  })

  test('clicking activity bar icon shows extension sidebar', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Click the extension's activity bar icon via store
    await page.evaluate(() => {
      (window as any).__stores__.activityBar.getState().toggleExtension('kitchen-sink-test')
    })

    // Sidebar should render
    const sidebar = page.locator('[data-testid="ks-sidebar"]')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    await expect(sidebar.locator('h2')).toHaveText('Kitchen Sink Sidebar')

    // Host UI components should be accessible
    await expect(page.locator('[data-testid="ks-button"]')).toBeVisible()
    await expect(page.locator('[data-testid="ks-badge"]')).toBeVisible()
  })

  // ── Tabs ─────────────────────────────────────────────────────────────────

  test('extension tab can be created and renders', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Create a kitchen-sink tab via store
    const tabId = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, {
        type: 'kitchen-sink',
        title: 'Kitchen Sink',
      })
    })

    expect(tabId).toBeTruthy()

    // Tab content should render
    const content = page.locator('[data-testid="ks-tab-content"]')
    await expect(content).toBeVisible({ timeout: 3000 })
    await expect(content.locator('h2')).toHaveText('Kitchen Sink Tab')
    await expect(page.locator('[data-testid="ks-tab-id"]')).toContainText(tabId)
  })

  test('extension file extension mapping works', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    const result = await page.evaluate(() => {
      const reg = (window as any).__stores__.extensionRegistry
      return {
        ks: reg.getTabTypeForFile('test.ks'),
        kitchensink: reg.getTabTypeForFile('test.kitchensink'),
      }
    })

    expect(result.ks).toBe('kitchen-sink')
    expect(result.kitchensink).toBe('kitchen-sink')
  })

  // ── New Tab Menu ─────────────────────────────────────────────────────────

  test('extension new tab menu items appear', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Need a tab first so tab bar is visible
    await addTerminalTab(page)

    // Click the new tab plus button
    const tabBar = page.locator('[style*="height: 36px"]').first()
    const plus = tabBar.locator('button').last()
    await plus.click()

    // Look for Kitchen Sink menu item
    const menuItem = page.locator('[role="menuitem"]', { hasText: 'Kitchen Sink' })
    await expect(menuItem.first()).toBeVisible({ timeout: 3000 })
  })

  test('extension new tab menu item creates a tab', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    await addTerminalTab(page)

    // Open new tab dropdown and click Kitchen Sink
    const tabBar = page.locator('[style*="height: 36px"]').first()
    const plus = tabBar.locator('button').last()
    await plus.click()

    const menuItem = page.locator('[role="menuitem"]', { hasText: 'Kitchen Sink' })
    await menuItem.first().click()

    // Tab content should appear
    const content = page.locator('[data-testid="ks-tab-content"]')
    await expect(content).toBeVisible({ timeout: 3000 })
  })

  // ── Settings Panel ───────────────────────────────────────────────────────

  test('extension settings panel renders', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Open settings dialog and navigate to the extension's section
    await page.evaluate(() => {
      (window as any).__stores__.settingsDialog.getState().openToSection('kitchen-sink-test')
    })

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // The extension's settings panel should render
    const settings = page.locator('[data-testid="ks-settings"]')
    await expect(settings).toBeVisible({ timeout: 3000 })
    await expect(settings.locator('h2')).toHaveText('Kitchen Sink Settings')
  })

  // ── Unload / Unregister ──────────────────────────────────────────────────

  test('unregistering extension removes all contributions', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Verify extension is present
    const extBefore = await page.evaluate(() => {
      return !!(window as any).__stores__.extensionRegistry.getExtension('kitchen-sink-test')
    })
    expect(extBefore).toBe(true)

    // Unregister
    await page.evaluate(() => {
      const stores = (window as any).__stores__
      // Deselect from activity bar so sidebar unmounts cleanly
      const ab = stores.activityBar.getState()
      if (ab.activeExtensionId === 'kitchen-sink-test') {
        ab.toggleExtension('kitchen-sink-test')
      }
      stores.extensionRegistry.unregister('kitchen-sink-test')
    })

    // Extension gone from registry
    const ext = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getExtension('kitchen-sink-test')
    })
    expect(ext).toBeUndefined()

    // Sidebar extensions should not include it
    const sidebarIds = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getSidebarExtensions()
        .map((e: any) => e.id)
    })
    expect(sidebarIds).not.toContain('kitchen-sink-test')

    // Tab type should be unregistered
    const tabType = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getTabTypeForFile('test.ks')
    })
    expect(tabType).not.toBe('kitchen-sink')

    // Menu items should be gone
    const menuItems = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getNewTabMenuItems()
        .filter((i: any) => i.label === 'Kitchen Sink')
    })
    expect(menuItems).toHaveLength(0)
  })

  // ── Enable / Disable ────────────────────────────────────────────────────

  test('disabling extension hides contributions, re-enabling restores them', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    // Verify initial state
    const initialActivateCount = await page.evaluate(() => (window as any).__kitchenSinkActivated__)
    expect(initialActivateCount).toBe(1)

    // Disable
    await page.evaluate(() => {
      (window as any).__stores__.extensionRegistry.setEnabled('kitchen-sink-test', false)
    })

    // Tab type should not resolve
    const tabTypeDisabled = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getTabTypeForFile('test.ks')
    })
    expect(tabTypeDisabled).not.toBe('kitchen-sink')

    // Sidebar extensions should not include it
    const sidebarExts = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getSidebarExtensions()
        .map((e: any) => e.id)
    })
    expect(sidebarExts).not.toContain('kitchen-sink-test')

    // Menu items should be empty for this extension
    const menuDisabled = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getNewTabMenuItems()
        .filter((i: any) => i.label === 'Kitchen Sink')
    })
    expect(menuDisabled).toHaveLength(0)

    // Re-enable
    await page.evaluate(() => {
      (window as any).__stores__.extensionRegistry.setEnabled('kitchen-sink-test', true)
    })

    // Tab type should resolve again
    const tabTypeEnabled = await page.evaluate(() => {
      return (window as any).__stores__.extensionRegistry.getTabTypeForFile('test.ks')
    })
    expect(tabTypeEnabled).toBe('kitchen-sink')

    // onActivate should fire again
    const reActivateCount = await page.evaluate(() => (window as any).__kitchenSinkActivated__)
    expect(reActivateCount).toBe(2)
  })

  // ── Session Info Registry ────────────────────────────────────────────────

  test('extension registers session info provider via onActivate', async ({ page }) => {
    await loadKitchenSinkExtension(page)

    const providerIds = await page.evaluate(() => {
      const api = (window as any).__conductorAPI__
      if (!api || !api.useSessionInfoRegistry) return []
      return api.useSessionInfoRegistry.getState().providers.map((p: any) => p.id)
    })

    expect(providerIds).toContain('kitchen-sink-info')
  })
})
