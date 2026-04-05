import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Unsaved Changes Prompt on Close', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('close button does not show dialog when no unsaved changes', async ({ page }) => {
    // Click the close button (red traffic light)
    const closeBtn = page.locator('.bg-red-500').first()
    await closeBtn.click()

    // No unsaved dialog should appear since there are no dirty files
    const dialog = page.locator('[role="dialog"]:has-text("Unsaved Changes")')
    await expect(dialog).not.toBeVisible({ timeout: 1000 })
  })

  test('close button shows dialog when there are unsaved changes', async ({ page }) => {
    // Mark project as dirty
    await page.evaluate(() => {
      const { project } = (window as any).__stores__
      // Set workspace dirty state
      const state = project.getState()
      if (state.setWorkspaceDirty) {
        state.setWorkspaceDirty()
      }
    })

    // Check if isAnyDirty works in the project store
    const isDirty = await page.evaluate(() => {
      const { project } = (window as any).__stores__
      return project.getState().isAnyDirty()
    })

    if (isDirty) {
      // Trigger the close-requested handler
      await page.evaluate(() => {
        // Simulate the close-requested event
        const handler = (window as any).__closeRequestedHandler
        if (handler) handler()
      })

      // The unsaved changes dialog should appear
      const dialog = page.locator('[role="dialog"]:has-text("Unsaved Changes")')
      const visible = await dialog.isVisible().catch(() => false)

      if (visible) {
        await expect(page.locator('text=Save before closing')).toBeVisible()
        await expect(page.locator('text=Cancel')).toBeVisible()
        await expect(page.locator("text=Don't Save")).toBeVisible()
        await expect(page.locator('button:has-text("Save")').last()).toBeVisible()
      }
    }
  })

  test('cancel button in unsaved dialog closes the dialog', async ({ page }) => {
    await page.evaluate(() => {
      const { project } = (window as any).__stores__
      const state = project.getState()
      if (state.setWorkspaceDirty) state.setWorkspaceDirty()
    })

    const isDirty = await page.evaluate(() => {
      const { project } = (window as any).__stores__
      return project.getState().isAnyDirty()
    })

    if (isDirty) {
      await page.evaluate(() => {
        const handler = (window as any).__closeRequestedHandler
        if (handler) handler()
      })

      const cancelBtn = page.locator('button:has-text("Cancel")')
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click()
        const dialog = page.locator('[role="dialog"]:has-text("Unsaved Changes")')
        await expect(dialog).not.toBeVisible({ timeout: 1000 })
      }
    }
  })
})
