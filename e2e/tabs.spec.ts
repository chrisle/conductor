import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, feedTerminalData } from './helpers'

test.describe('Tab Management', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('adds a terminal tab via store', async ({ page }) => {
    const tabId = await addTerminalTab(page)
    expect(tabId).toBeTruthy()

    // Tab title should appear in the tab bar
    await expect(page.locator('text=Terminal').first()).toBeVisible()

    // xterm should be rendered
    await expect(page.locator('.xterm')).toBeVisible()
  })

  test('adds multiple tabs and shows them in the tab bar', async ({ page }) => {
    // Add tabs via store directly to avoid xterm strict mode issues
    const ids = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const id1 = tabs.getState().addTab(groupId, { type: 'terminal', title: 'Term 1' })
      const id2 = tabs.getState().addTab(groupId, { type: 'terminal', title: 'Term 2' })
      return [id1, id2]
    })

    await expect(page.locator('text=Term 1')).toBeVisible()
    await expect(page.locator('text=Term 2')).toBeVisible()
  })

  test('clicking a tab switches to it', async ({ page }) => {
    // Add two tabs via store
    const { tab1Id } = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const tab1Id = tabs.getState().addTab(groupId, { type: 'terminal', title: 'First' })
      const tab2Id = tabs.getState().addTab(groupId, { type: 'terminal', title: 'Second' })
      return { tab1Id, tab2Id }
    })

    // Second tab should be active (most recently added)
    // Click on first tab to switch
    await page.locator('text=First').click()

    // Verify the first tab is now active in the store
    const activeTabId = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[groupId].activeTabId
    })
    expect(activeTabId).toBe(tab1Id)
  })

  test('close button removes a tab', async ({ page }) => {
    await addTerminalTab(page, { title: 'Closeable' })

    // Hover over tab to reveal close button
    const tab = page.locator('text=Closeable')
    await tab.hover()

    // Click the X close button (it's a sibling in the same tab container)
    const tabContainer = tab.locator('..')
    const closeBtn = tabContainer.locator('svg').last()
    await closeBtn.click()

    // Tab should be gone
    await expect(page.locator('text=Closeable')).not.toBeVisible()
  })

  test('Cmd+T opens a new terminal tab', async ({ page }) => {
    // Initially no terminal tabs
    const initialTabCount = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[groupId]?.tabs.length ?? 0
    })

    // Press Cmd+T (or Ctrl+T)
    await page.keyboard.press('Meta+t')

    // Wait for new tab
    await page.locator('.xterm').waitFor({ state: 'attached', timeout: 5000 })

    const newTabCount = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[groupId]?.tabs.length ?? 0
    })
    expect(newTabCount).toBe(initialTabCount + 1)
  })

  test('Cmd+W closes the active tab', async ({ page }) => {
    await addTerminalTab(page, { title: 'ToClose' })
    await expect(page.locator('text=ToClose')).toBeVisible()

    await page.keyboard.press('Meta+w')

    // Tab should be removed
    await expect(page.locator('text=ToClose')).not.toBeVisible({ timeout: 3000 })
  })

  test('adding a Claude Code tab shows claude-specific UI', async ({ page }) => {
    await addTerminalTab(page, { type: 'claude-code', title: 'Claude' })

    // Should see the tab
    await expect(page.locator('text=Claude').first()).toBeVisible()

    // Claude Code tabs have an autopilot toggle
    const autopilot = page.locator('text=Auto-pilot')
    await autopilot.waitFor({ state: 'visible', timeout: 5000 })
    await expect(autopilot).toBeVisible()
  })

  test('terminal receives and displays data', async ({ page }) => {
    const tabId = await addTerminalTab(page)

    // Feed some output
    await feedTerminalData(page, tabId, 'hello from test\r\n')

    // Verify it renders
    await expect(async () => {
      const text = await page.evaluate(() => {
        return document.querySelector('.xterm-rows')?.textContent ?? ''
      })
      expect(text).toContain('hello from test')
    }).toPass({ timeout: 3000, intervals: [200] })
  })

  test('multiple terminals can receive data independently', async ({ page }) => {
    // Add first tab and wait for it fully
    const tab1 = await addTerminalTab(page, { title: 'Alpha' })

    // Feed data to tab1 while it's active
    await feedTerminalData(page, tab1, 'UNIQUE_ALPHA\r\n')

    // Verify Alpha data rendered
    await expect(async () => {
      const text = await page.evaluate(() => {
        return document.querySelector('.xterm-rows')?.textContent ?? ''
      })
      expect(text).toContain('UNIQUE_ALPHA')
    }).toPass({ timeout: 3000, intervals: [200] })

    // Add second tab via store (avoids addTerminalTab's .xterm strict mode issue)
    const tab2 = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, { type: 'terminal', title: 'Beta' })
    })

    // Wait for mount
    await page.waitForTimeout(500)

    // Feed data to tab2
    await feedTerminalData(page, tab2, 'UNIQUE_BETA\r\n')

    // Switch back to Alpha tab using exact text match in tab bar
    // Use the tab bar container to click only tab labels, not terminal content
    const tabBar = page.locator('[style*="height: 36px"]').first()
    await tabBar.locator('text=Alpha').click()

    await expect(async () => {
      const text = await page.evaluate(() => {
        return document.querySelector('.xterm-rows')?.textContent ?? ''
      })
      expect(text).toContain('UNIQUE_ALPHA')
    }).toPass({ timeout: 3000, intervals: [200] })
  })
})
