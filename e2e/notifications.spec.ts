import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, feedTerminalData } from './helpers'

test.describe('Notifications Extension', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  /**
   * Helper: open the notifications sidebar and add two terminal tabs,
   * switching to the second so that the first is a background tab
   * (notifications only fire for non-active tabs).
   */
  async function setupBackgroundTab(page: import('@playwright/test').Page) {
    // Open notifications sidebar so the useTerminalNotifications hook mounts
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('notifications')
    })
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible({ timeout: 3000 })

    // Add two terminal tabs — the second will be active
    const tab1Id = await addTerminalTab(page, { title: 'Background' })

    // Add a second tab so tab1 becomes a background tab
    const tab2Id = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, { type: 'terminal', title: 'Active' })
    })
    // Wait for the second tab to be fully active
    await page.waitForTimeout(300)

    return { tab1Id, tab2Id }
  }

  test('bell character in background tab triggers notification', async ({ page }) => {
    const { tab1Id } = await setupBackgroundTab(page)

    // Feed bell character to the background tab
    await feedTerminalData(page, tab1Id, '\x07Build finished\r\n')

    // Wait for notification to appear
    await expect(async () => {
      const notifText = await page.evaluate(() => {
        // Check the notifications store directly
        const items = document.querySelectorAll('[class*="divide-y"] button')
        return Array.from(items).map(el => el.textContent).join(' | ')
      })
      expect(notifText).toContain('Task finished')
    }).toPass({ timeout: 5000, intervals: [300] })
  })

  test('Claude completion pattern in background tab triggers notification', async ({ page }) => {
    const { tab1Id } = await setupBackgroundTab(page)

    // Feed Claude Code completion pattern
    await feedTerminalData(page, tab1Id, 'Cooked for 35s\r\n')

    await expect(async () => {
      const notifText = await page.evaluate(() => {
        const items = document.querySelectorAll('[class*="divide-y"] button')
        return Array.from(items).map(el => el.textContent).join(' | ')
      })
      expect(notifText).toContain('Cooked')
    }).toPass({ timeout: 5000, intervals: [300] })
  })

  test('error pattern in background tab triggers error notification', async ({ page }) => {
    const { tab1Id } = await setupBackgroundTab(page)

    // Feed error output
    await feedTerminalData(page, tab1Id, '\nError: Module not found\r\n')

    await expect(async () => {
      const notifText = await page.evaluate(() => {
        const items = document.querySelectorAll('[class*="divide-y"] button')
        return Array.from(items).map(el => el.textContent).join(' | ')
      })
      expect(notifText).toContain('Error')
    }).toPass({ timeout: 5000, intervals: [300] })
  })

  test('process exit generates notification', async ({ page }) => {
    const { tab1Id } = await setupBackgroundTab(page)

    // Signal process exit on the background tab
    await page.evaluate(
      (id) => (window as any).__testTerminal__.feedExit(id),
      tab1Id,
    )

    await expect(async () => {
      const notifText = await page.evaluate(() => {
        const items = document.querySelectorAll('[class*="divide-y"] button')
        return Array.from(items).map(el => el.textContent).join(' | ')
      })
      expect(notifText).toContain('Process exited')
    }).toPass({ timeout: 5000, intervals: [300] })
  })

  test('empty notification list shows placeholder', async ({ page }) => {
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('notifications')
    })

    await expect(page.locator('text=No notifications yet')).toBeVisible({ timeout: 3000 })
  })

  test('notification settings panel renders toggles', async ({ page }) => {
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('notifications')
    })

    await expect(page.locator('text=Notification Types')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Task completions')).toBeVisible()
    await expect(page.getByText('Errors', { exact: true })).toBeVisible()
    await expect(page.locator('text=Process exits')).toBeVisible()
    await expect(page.locator('text=Mentions')).toBeVisible()
  })

  test('active tab does not generate notifications', async ({ page }) => {
    // Open notifications sidebar
    await page.evaluate(() => {
      const { activityBar } = (window as any).__stores__
      activityBar.getState().setActiveExtension('notifications')
    })
    await expect(page.locator('text=No notifications yet')).toBeVisible({ timeout: 3000 })

    // Add a single terminal tab (it will be the active tab)
    const tabId = await addTerminalTab(page)

    // Feed bell character to the active tab — should NOT trigger notification
    await feedTerminalData(page, tabId, '\x07Done\r\n')

    await page.waitForTimeout(1000)

    // Should still show the empty placeholder
    await expect(page.locator('text=No notifications yet')).toBeVisible()
  })
})
