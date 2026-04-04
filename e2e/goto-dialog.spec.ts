import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('GoTo Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  async function openGoToDialog(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      const { ui } = (window as any).__stores__
      ui.getState().setGoToOpen(true)
    })
    await page.locator('[cmdk-input]').waitFor({ state: 'visible', timeout: 3000 })
  }

  test('Cmd+G opens the GoTo dialog', async ({ page }) => {
    await page.keyboard.press('Meta+g')
    await expect(page.locator('[cmdk-input]')).toBeVisible({ timeout: 3000 })
  })

  test('typing a path and pressing Enter navigates to that directory', async ({ page }) => {
    await openGoToDialog(page)

    const input = page.locator('[cmdk-input]')
    await input.fill('/usr/local')
    await input.press('Enter')

    // Dialog should close
    await expect(page.locator('[cmdk-input]')).not.toBeVisible({ timeout: 3000 })

    // Sidebar rootPath should be updated
    const rootPath = await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      return sidebar.getState().rootPath
    })
    expect(rootPath).toBe('/usr/local')
  })

  test('typing a tilde path and pressing Enter expands home directory', async ({ page }) => {
    await openGoToDialog(page)

    const input = page.locator('[cmdk-input]')
    await input.fill('~/Documents')
    await input.press('Enter')

    await expect(page.locator('[cmdk-input]')).not.toBeVisible({ timeout: 3000 })

    const rootPath = await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      return sidebar.getState().rootPath
    })
    // getHomeDir returns '/tmp' in mocks, so ~/Documents → /tmp/Documents
    expect(rootPath).toBe('/tmp/Documents')
  })

  test('trailing slash is stripped from the path', async ({ page }) => {
    await openGoToDialog(page)

    const input = page.locator('[cmdk-input]')
    await input.fill('/usr/local/')
    await input.press('Enter')

    await expect(page.locator('[cmdk-input]')).not.toBeVisible({ timeout: 3000 })

    const rootPath = await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      return sidebar.getState().rootPath
    })
    expect(rootPath).toBe('/usr/local')
  })

  test('pressing Enter with empty input does not navigate', async ({ page }) => {
    // Set a known rootPath first
    await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      sidebar.getState().setRootPath('/original')
    })

    await openGoToDialog(page)

    const input = page.locator('[cmdk-input]')
    await input.press('Enter')

    // Wait briefly to ensure nothing changed
    await page.waitForTimeout(300)

    const rootPath = await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      return sidebar.getState().rootPath
    })
    expect(rootPath).toBe('/original')
  })

  test('selecting a suggestion navigates to it', async ({ page }) => {
    await openGoToDialog(page)

    // Favorites are empty in mock, suggestions depend on autocomplete which returns []
    // So test clicking a favorite by adding one first
    await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      sidebar.getState().addFavorite('/tmp/my-project')
    })

    // Reopen to see favorite
    await page.evaluate(() => {
      const { ui } = (window as any).__stores__
      ui.getState().setGoToOpen(false)
    })
    await page.waitForTimeout(100)
    await openGoToDialog(page)

    // Click the favorite
    await page.locator('text=my-project').click()

    await expect(page.locator('[cmdk-input]')).not.toBeVisible({ timeout: 3000 })

    const rootPath = await page.evaluate(() => {
      const { sidebar } = (window as any).__stores__
      return sidebar.getState().rootPath
    })
    expect(rootPath).toBe('/tmp/my-project')
  })
})
