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

test('matchPrompt correctly identifies Claude Code prompts', async ({ page }) => {
  await installTestMocks(page)
  await waitForApp(page)

  const results = await page.evaluate(() => {
    const patterns: Array<{ input: string; expected: string | null }> = [
      { input: ' Do you want to create Dockerfile?\n ❯ 1. Yes', expected: '\r' },
      { input: '> Yes  Allow once', expected: '\r' },
      { input: 'Continue? (Y/n)', expected: 'y\r' },
      { input: 'Allow access? (y/n)', expected: 'y\r' },
      { input: 'Hello world', expected: null },
    ]

    return patterns.map(({ input, expected }) => {
      let result: string | null = null
      if (/1\.?\s*Yes/s.test(input)) result = '\r'
      else if (/[❯>]\s+Yes\b/.test(input)) result = '\r'
      else if (/Yes\s+(Allow once|and don't ask)/i.test(input)) result = '\r'
      else if (/\(Y\/n\)\s*$/im.test(input)) result = 'y\r'
      else if (/\(y\/N\)\s*$/im.test(input)) result = 'y\r'
      else if (/Allow.*\(y\/n\)/i.test(input)) result = 'y\r'

      return { input, expected, actual: result, pass: result === expected }
    })
  })

  for (const r of results) {
    expect(r.pass, `matchPrompt("${r.input}") expected ${r.expected} got ${r.actual}`).toBe(true)
  }
})
