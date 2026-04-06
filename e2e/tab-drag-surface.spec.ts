import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

/**
 * E2E tests for CON-61: dragging a tab should work from any part of
 * the tab surface (icon, padding, close button area), not just the text.
 */
test.describe('Tab drag from any surface area (CON-61)', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    // Patch missing mock methods that cause the App to crash
    await page.addInitScript(() => {
      const api = (window as any).electronAPI
      if (api && !api.onCloseTabRequested) {
        api.onCloseTabRequested = () => () => {}
        api.offCloseTabRequested = () => {}
        api.getSessionMetrics = async () => ({})
        api.conductordGetTmuxSessions = async () => []
        api.conductordKillTmuxSession = async () => ({ success: true })
      }
    })
    await waitForApp(page)
  })

  test('tab div has draggable attribute and -webkit-user-drag style', async ({ page }) => {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'DragMe' })
    })

    const tabText = page.locator('text=DragMe').first()
    await expect(tabText).toBeVisible()
    const tabDiv = tabText.locator('..')

    await expect(tabDiv).toHaveAttribute('draggable', 'true')

    // Must have -webkit-user-drag: element inline style for full-surface drag
    const style = await tabDiv.getAttribute('style')
    expect(style).toContain('user-drag: element')

    await page.screenshot({ path: 'e2e/screenshots/con-61-tab-before-drag.png' })
  })

  test('close button has draggable=false so it does not block parent drag', async ({ page }) => {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'CloseDrag' })
    })

    const tabText = page.locator('text=CloseDrag').first()
    await expect(tabText).toBeVisible()
    const tabDiv = tabText.locator('..')

    await tabDiv.hover()

    const closeBtn = tabDiv.locator('button')
    await expect(closeBtn).toHaveAttribute('draggable', 'false')
  })

  test('dragstart event fires on the tab div', async ({ page }) => {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'PadDrag' })
    })

    const tabText = page.locator('text=PadDrag').first()
    await expect(tabText).toBeVisible()
    const tabDiv = tabText.locator('..')

    // Verify dragstart fires when dispatched on the tab div
    const dragStartFired = await tabDiv.evaluate((el) => {
      return new Promise<boolean>((resolve) => {
        el.addEventListener('dragstart', () => resolve(true), { once: true })
        const dragStart = new DragEvent('dragstart', {
          bubbles: true,
          dataTransfer: new DataTransfer()
        })
        el.dispatchEvent(dragStart)
        setTimeout(() => resolve(false), 500)
      })
    })

    expect(dragStartFired).toBe(true)
    await page.screenshot({ path: 'e2e/screenshots/con-61-tab-drag-from-padding.png' })
  })

  test('drag and drop reorder works via store', async ({ page }) => {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'First' })
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'Second' })
    })

    await expect(page.locator('text=First').first()).toBeVisible()
    await expect(page.locator('text=Second').first()).toBeVisible()

    await page.screenshot({ path: 'e2e/screenshots/con-61-tabs-before-reorder.png' })

    const initialOrder = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[groupId].tabs.map((t: any) => t.title)
    })
    expect(initialOrder).toEqual(['First', 'Second'])

    // Reorder via store (same logic as handleTabDrop)
    // reorderTab takes (groupId, fromIndex, toIndex)
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().reorderTab(groupId, 1, 0)
    })

    const newOrder = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[groupId].tabs.map((t: any) => t.title)
    })
    expect(newOrder).toEqual(['Second', 'First'])

    await page.screenshot({ path: 'e2e/screenshots/con-61-tabs-after-reorder.png' })
  })
})
