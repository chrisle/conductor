import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('displays zoom controls', async ({ page }) => {
    // Zoom percentage should be visible (defaults to 100%)
    await expect(page.locator('text=100%')).toBeVisible()
  })

  test('footer is rendered at bottom', async ({ page }) => {
    const footer = await page.evaluate(() => {
      // Find the footer by its characteristic classes
      const el = document.querySelector('.h-6.border-t')
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return {
        exists: true,
        height: rect.height,
        bottom: rect.bottom,
        windowHeight: window.innerHeight,
      }
    })
    expect(footer).not.toBeNull()
    expect(footer!.exists).toBe(true)
    // Footer should be near the bottom of the viewport
    expect(footer!.bottom).toBeGreaterThan(footer!.windowHeight - 50)
  })

  test('shows conductor daemon status area', async ({ page }) => {
    // The mock returns conductordHealth: true
    // Wait for the footer content to render
    await expect(async () => {
      const footerText = await page.evaluate(() => {
        const footer = document.querySelector('.h-6.border-t')
        return footer?.textContent ?? ''
      })
      // Footer should have some text content
      expect(footerText.length).toBeGreaterThan(0)
    }).toPass({ timeout: 3000, intervals: [200] })
  })
})
