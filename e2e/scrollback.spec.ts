import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, feedTerminalData } from './helpers'

test.describe('Terminal Scrollback Buffer', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('terminal renders large amounts of data without crashing', async ({ page }) => {
    const tabId = await addTerminalTab(page)

    // Feed a large amount of terminal output (500 lines)
    const lines: string[] = []
    for (let i = 0; i < 500; i++) {
      lines.push(`Line ${i}: ${'x'.repeat(80)}`)
    }
    await feedTerminalData(page, tabId, lines.join('\r\n') + '\r\n')

    // Verify terminal still renders and has content
    await expect(async () => {
      const text = await page.evaluate(() => {
        return document.querySelector('.xterm-rows')?.textContent ?? ''
      })
      expect(text.length).toBeGreaterThan(0)
    }).toPass({ timeout: 5000, intervals: [300] })
  })

  test('terminal continues to accept data after large output', async ({ page }) => {
    const tabId = await addTerminalTab(page)

    // Feed initial large output
    const lines: string[] = []
    for (let i = 0; i < 200; i++) {
      lines.push(`old-line-${i}`)
    }
    await feedTerminalData(page, tabId, lines.join('\r\n') + '\r\n')

    // Now feed new distinctive data
    await feedTerminalData(page, tabId, 'AFTER_LARGE_OUTPUT_MARKER\r\n')

    // Verify the new data is visible
    await expect(async () => {
      const text = await page.evaluate(() => {
        return document.querySelector('.xterm-rows')?.textContent ?? ''
      })
      expect(text).toContain('AFTER_LARGE_OUTPUT_MARKER')
    }).toPass({ timeout: 5000, intervals: [300] })
  })
})
