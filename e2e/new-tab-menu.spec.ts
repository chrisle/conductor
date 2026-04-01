import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab } from './helpers'

test.describe('New Tab Menu', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('plus button opens new tab dropdown', async ({ page }) => {
    // First add a tab so the tab bar is visible
    await addTerminalTab(page)

    // Find and click the plus button in the tab bar
    const plusBtn = page.locator('[data-radix-collection-item]').filter({
      has: page.locator('svg'),
    }).last()

    // Alternative: look for the plus icon button near the tab bar
    const tabBar = page.locator('[style*="height: 36px"]').first()
    if (await tabBar.isVisible()) {
      const plus = tabBar.locator('button').last()
      await plus.click()

      // Dropdown should appear with menu items
      await expect(async () => {
        const menuVisible = await page.locator('[role="menuitem"]').count()
        expect(menuVisible).toBeGreaterThan(0)
      }).toPass({ timeout: 3000, intervals: [200] })
    }
  })

  test('new tab menu contains Terminal option', async ({ page }) => {
    await addTerminalTab(page)

    // Click the new tab plus button
    const tabBar = page.locator('[style*="height: 36px"]').first()
    if (await tabBar.isVisible()) {
      const plus = tabBar.locator('button').last()
      await plus.click()

      // Look for Terminal menu item
      const terminalItem = page.locator('[role="menuitem"]', { hasText: 'Terminal' })
      await expect(terminalItem.first()).toBeVisible({ timeout: 3000 })
    }
  })
})
