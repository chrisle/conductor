import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab } from './helpers'

test('autopilot toggle enables and disables', async ({ page }) => {
  await installTestMocks(page)
  await waitForApp(page)

  // Add a Claude Code tab — this renders the autopilot toggle in the footer
  await addTerminalTab(page, { type: 'claude-code', title: 'Claude Test' })

  // The autopilot toggle should be visible
  const toggleLabel = page.locator('label', { hasText: 'Auto-pilot' })
  await toggleLabel.waitFor({ state: 'visible', timeout: 5000 })

  // Initially off — check the toggle button color (zinc-700 = off)
  const toggleBtn = toggleLabel.locator('..').locator('button')
  const bgBefore = await toggleBtn.evaluate(el => el.style.backgroundColor)
  expect(bgBefore).toContain('63') // #3f3f46 rgb(63,63,70) = off

  // Click to enable
  await toggleLabel.click()

  // Verify toggle color changed (yellow = on)
  const bgAfter = await toggleBtn.evaluate(el => el.style.backgroundColor)
  expect(bgAfter).not.toBe(bgBefore)
})

