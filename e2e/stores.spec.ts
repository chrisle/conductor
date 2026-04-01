import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Store Integration', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('stores are exposed on window.__stores__', async ({ page }) => {
    const storeKeys = await page.evaluate(() => {
      const stores = (window as any).__stores__
      return stores ? Object.keys(stores) : []
    })

    expect(storeKeys).toContain('tabs')
    expect(storeKeys).toContain('layout')
    expect(storeKeys).toContain('sidebar')
  })

  test('layout store initializes with a root node', async ({ page }) => {
    const root = await page.evaluate(() => {
      return (window as any).__stores__.layout.getState().root
    })
    expect(root).not.toBeNull()
  })

  test('layout store has at least one group', async ({ page }) => {
    const groupIds = await page.evaluate(() => {
      return (window as any).__stores__.layout.getState().getAllGroupIds()
    })
    expect(groupIds.length).toBeGreaterThanOrEqual(1)
  })

  test('adding tab via store updates UI', async ({ page }) => {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, {
        type: 'terminal',
        title: 'Store Test Tab',
      })
    })

    // The tab should appear in the UI
    await expect(page.locator('text=Store Test Tab')).toBeVisible({ timeout: 3000 })
  })

  test('removing tab via store updates UI', async ({ page }) => {
    // Add a tab
    const { tabId, groupId } = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const tabId = tabs.getState().addTab(groupId, {
        type: 'terminal',
        title: 'Removable Tab',
      })
      return { tabId, groupId }
    })

    await expect(page.locator('text=Removable Tab')).toBeVisible({ timeout: 3000 })

    // Remove it
    await page.evaluate(({ tabId, groupId }) => {
      (window as any).__stores__.tabs.getState().removeTab(groupId, tabId)
    }, { tabId, groupId })

    await expect(page.locator('text=Removable Tab')).not.toBeVisible({ timeout: 3000 })
  })

  test('sidebar store rootPath is accessible', async ({ page }) => {
    const rootPath = await page.evaluate(() => {
      return (window as any).__stores__.sidebar.getState().rootPath
    })
    // May be null in test environment, just verify it's accessible
    expect(rootPath === null || typeof rootPath === 'string').toBe(true)
  })

  test('tabs store creates groups with unique ids', async ({ page }) => {
    const ids = await page.evaluate(() => {
      const { tabs } = (window as any).__stores__
      const id1 = tabs.getState().createGroup()
      const id2 = tabs.getState().createGroup()
      return [id1, id2]
    })
    expect(ids[0]).not.toBe(ids[1])
  })
})
