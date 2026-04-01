import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test('app launches without errors and renders UI', async ({ page }) => {
  await installTestMocks(page)

  const consoleErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  await waitForApp(page)

  const diag = await page.evaluate(() => ({
    bodyLen: document.body.innerText.length,
    hasStores: !!(window as any).__stores__,
    rootNode: (window as any).__stores__?.layout?.getState()?.root,
    divCount: document.querySelectorAll('div').length,
  }))

  expect(diag.hasStores).toBe(true)
  expect(diag.rootNode).not.toBeNull()
  expect(diag.divCount).toBeGreaterThan(0)
  expect(pageErrors).toEqual([])
  // Filter out benign errors (e.g. failed extension loads in test env)
  const realErrors = consoleErrors.filter(e => !e.includes('Failed to load external extensions'))
  expect(realErrors).toEqual([])
})
