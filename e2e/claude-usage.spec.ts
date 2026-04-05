import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

test.describe('Claude Usage Stats', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('footer renders usage indicator when store has data', async ({ page }) => {
    // Set usage data in the store
    await page.evaluate(() => {
      // Access the claude-usage store — it's a module singleton
      // We inject data via localStorage which the scraper hydrates from
      localStorage.setItem('conductor:claude-usage', JSON.stringify({
        raw: "You've used approximately 42.5% of your daily limit.",
        percentUsed: 42.5,
        statusLine: "You've used approximately 42.5% of your daily limit.",
        lastUpdated: Date.now(),
      }))
    })

    // Reload to pick up the localStorage data
    await waitForApp(page)

    // Wait for the usage indicator to appear
    await expect(async () => {
      const footer = await page.evaluate(() => {
        const el = document.querySelector('.h-6.border-t')
        return el?.textContent ?? ''
      })
      expect(footer).toContain('Usage')
    }).toPass({ timeout: 8000, intervals: [500] })
  })

  test('usage indicator shows correct color for low usage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('conductor:claude-usage', JSON.stringify({
        raw: '20% of your daily limit',
        percentUsed: 20,
        statusLine: '20% of your daily limit',
        lastUpdated: Date.now(),
      }))
    })

    await waitForApp(page)

    // Check for emerald (green) color dot — low usage
    await expect(async () => {
      const hasDot = await page.evaluate(() => {
        const dots = document.querySelectorAll('.bg-emerald-400')
        return dots.length > 0
      })
      expect(hasDot).toBe(true)
    }).toPass({ timeout: 8000, intervals: [500] })
  })

  test('usage indicator shows amber for high usage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('conductor:claude-usage', JSON.stringify({
        raw: '75% of your daily limit',
        percentUsed: 75,
        statusLine: '75% of your daily limit',
        lastUpdated: Date.now(),
      }))
    })

    await waitForApp(page)

    await expect(async () => {
      const hasAmber = await page.evaluate(() => {
        const dots = document.querySelectorAll('.bg-amber-400')
        return dots.length > 0
      })
      expect(hasAmber).toBe(true)
    }).toPass({ timeout: 8000, intervals: [500] })
  })

  test('usage indicator shows red for critical usage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('conductor:claude-usage', JSON.stringify({
        raw: '95% of your daily limit',
        percentUsed: 95,
        statusLine: '95% of your daily limit',
        lastUpdated: Date.now(),
      }))
    })

    await waitForApp(page)

    await expect(async () => {
      const hasRed = await page.evaluate(() => {
        const dots = document.querySelectorAll('.bg-red-400')
        return dots.length > 0
      })
      expect(hasRed).toBe(true)
    }).toPass({ timeout: 8000, intervals: [500] })
  })

  test('usage percentage text is displayed in footer', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('conductor:claude-usage', JSON.stringify({
        raw: '42.5% of your daily limit',
        percentUsed: 42.5,
        statusLine: '42.5% of your daily limit',
        lastUpdated: Date.now(),
      }))
    })

    await waitForApp(page)

    await expect(async () => {
      const footerText = await page.evaluate(() => {
        const footer = document.querySelector('.h-6.border-t')
        return footer?.textContent ?? ''
      })
      expect(footerText).toContain('42.5%')
    }).toPass({ timeout: 8000, intervals: [500] })
  })
})
