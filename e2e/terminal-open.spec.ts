import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, feedTerminalData } from './helpers'

test('terminal tab renders and displays PTY data', async ({ page }) => {
  await installTestMocks(page)
  await waitForApp(page)

  const tabId = await addTerminalTab(page)

  // Feed output as if a command produced it
  await feedTerminalData(page, tabId, '$ printf READY\r\nREADY\r\n$ ')

  // Verify xterm rendered the output
  await expect(async () => {
    const hasReady = await page.evaluate(() => {
      const rows = document.querySelector('.xterm-rows')
      return rows?.textContent?.includes('READY') ?? false
    })
    expect(hasReady).toBe(true)
  }).toPass({ timeout: 3000, intervals: [200] })
})
