import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Sidebar Toggle (Window Layout)', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('sidebar toggle button is visible in title bar', async ({ page }) => {
    // The PanelLeft icon button should be in the title bar
    const toggleBtn = page.locator('button:has(svg.lucide-panel-left)')
    await expect(toggleBtn).toBeVisible({ timeout: 3000 })
  })

  test('clicking sidebar toggle collapses the sidebar', async ({ page }) => {
    // First, open a sidebar so there's something to collapse
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('file-explorer')
    })

    // Verify sidebar is open
    const isOpen = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId !== null
    })
    expect(isOpen).toBe(true)

    // Click the toggle button
    const toggleBtn = page.locator('button:has(svg.lucide-panel-left)')
    await toggleBtn.click()

    // Verify sidebar is collapsed
    const isCollapsed = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId === null
    })
    expect(isCollapsed).toBe(true)
  })

  test('clicking sidebar toggle again restores the sidebar', async ({ page }) => {
    // Open a sidebar
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('file-explorer')
    })

    const toggleBtn = page.locator('button:has(svg.lucide-panel-left)')

    // Collapse
    await toggleBtn.click()
    const afterCollapse = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId
    })
    expect(afterCollapse).toBeNull()

    // Restore
    await toggleBtn.click()
    const afterRestore = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId
    })
    expect(afterRestore).toBe('file-explorer')
  })

  test('Cmd+B toggles the sidebar', async ({ page }) => {
    // Open a sidebar
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('file-explorer')
    })

    // Press Cmd+B to collapse
    await page.keyboard.press('Meta+b')

    await page.waitForTimeout(200)
    const collapsed = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId === null
    })
    expect(collapsed).toBe(true)

    // Press Cmd+B again to restore
    await page.keyboard.press('Meta+b')

    await page.waitForTimeout(200)
    const restored = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId
    })
    expect(restored).toBe('file-explorer')
  })

  test('sidebar remembers last active extension after toggle cycle', async ({ page }) => {
    // Switch to notifications sidebar
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('notifications')
    })

    // Collapse and restore
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().collapseSidebar()
    })

    const lastActive = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().lastActiveExtensionId
    })
    expect(lastActive).toBe('notifications')

    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().restoreSidebar()
    })

    const restored = await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      return activityBar.getState().activeExtensionId
    })
    expect(restored).toBe('notifications')
  })
})
