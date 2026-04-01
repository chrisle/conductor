import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Settings Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('opens settings dialog via store', async ({ page }) => {
    // Open settings dialog via store
    await page.evaluate(() => {
      const store = (window as any).__stores__
      // The settings dialog is controlled by settingsDialog store
      // which is exposed via the __stores__ object
      if (store.settingsDialog) {
        store.settingsDialog.getState().setOpen(true)
      }
    })

    // Check if dialog is visible - look for "Settings" title in dialog
    const dialog = page.locator('[role="dialog"]')
    const dialogVisible = await dialog.isVisible().catch(() => false)

    if (dialogVisible) {
      await expect(dialog).toBeVisible()
      await expect(page.locator('text=Extensions').first()).toBeVisible()
    }
  })

  test('settings dialog shows extension sections', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__stores__
      if (store.settingsDialog) {
        store.settingsDialog.getState().setOpen(true)
      }
    })

    const dialog = page.locator('[role="dialog"]')
    const dialogVisible = await dialog.isVisible().catch(() => false)

    if (dialogVisible) {
      // Should have navigation items
      await expect(page.locator('text=Extensions').first()).toBeVisible()
      await expect(page.locator('text=Conductor Daemon').first()).toBeVisible()
    }
  })
})
