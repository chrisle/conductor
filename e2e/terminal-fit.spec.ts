import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp, addTerminalTab, feedTerminalData } from './helpers'

/**
 * Build the same long line that long-line.sh would produce:
 * |01|02|03|...|75|END
 */
function buildLongLine(): string {
  let line = ''
  for (let i = 1; i <= 75; i++) {
    line += `|${String(i).padStart(2, '0')}`
  }
  return line + '|END'
}

test('terminal output fits within the visible area', async ({ page }) => {
  await installTestMocks(page)
  await waitForApp(page)

  const tabId = await addTerminalTab(page)

  // Feed the long line as terminal output
  const longLine = buildLongLine()
  await feedTerminalData(page, tabId, longLine + '\r\n')

  // Wait for xterm to render the line
  await expect(async () => {
    const hasEnd = await page.evaluate(() => {
      const rows = document.querySelector('.xterm-rows')
      return rows?.textContent?.includes('END') ?? false
    })
    expect(hasEnd).toBe(true)
  }).toPass({ timeout: 3000, intervals: [200] })

  // Measure whether the rendered content fits within the terminal viewport
  const fit = await page.evaluate(() => {
    const xtermEl = document.querySelector('.xterm') as HTMLElement | null
    const rows = Array.from(xtermEl?.querySelectorAll('.xterm-rows > div') || [])
    const targetIndex = rows.findIndex(row => (row.textContent || '').includes('|01|'))
    const targetRow = targetIndex >= 0 ? rows[targetIndex] : null
    const nextRow = targetIndex >= 0 ? rows[targetIndex + 1] : null
    const screen = xtermEl?.querySelector('.xterm-screen') as HTMLElement | null

    let measuredCellWidth = 0
    for (const span of Array.from(xtermEl?.querySelectorAll('.xterm-rows span') || [])) {
      const text = span.textContent || ''
      if (!text.trim()) continue
      const rect = (span as HTMLElement).getBoundingClientRect()
      if (rect.width > 0) {
        measuredCellWidth = rect.width / text.length
        break
      }
    }

    return {
      targetIndex,
      line1: targetRow?.textContent || '',
      line2: nextRow?.textContent || '',
      measuredCellWidth,
      estimatedWidth: (targetRow?.textContent?.length || 0) * measuredCellWidth,
      screenWidth: screen?.getBoundingClientRect().width || 0,
    }
  })

  expect(fit.targetIndex).toBeGreaterThanOrEqual(0)
  expect(fit.line1).toContain('|01|')
  expect(fit.measuredCellWidth).toBeGreaterThan(0)
  expect(fit.estimatedWidth).toBeLessThanOrEqual(fit.screenWidth + 1)
})

test('terminal fit isolates xterm from app body spacing', async ({ page }) => {
  await installTestMocks(page)
  await waitForApp(page)

  await addTerminalTab(page)

  // Wait for xterm's character measurement element (multiple may exist, use first)
  await page.locator('.xterm .xterm-char-measure-element').first().waitFor({ state: 'attached', timeout: 5000 })

  const styles = await page.evaluate(() => {
    const terminal = document.querySelector('.xterm') as HTMLElement | null
    const host = terminal?.parentElement as HTMLElement | null
    const measure = document.querySelector('.xterm .xterm-char-measure-element') as HTMLElement | null
    if (!terminal || !host || !measure) return null

    return {
      bodyLetterSpacing: getComputedStyle(document.body).letterSpacing,
      terminalLetterSpacing: getComputedStyle(terminal).letterSpacing,
      measureLetterSpacing: getComputedStyle(measure).letterSpacing,
      hostPaddingLeft: getComputedStyle(host).paddingLeft,
      hostPaddingRight: getComputedStyle(host).paddingRight,
    }
  })

  expect(styles).not.toBeNull()
  expect(styles?.bodyLetterSpacing).not.toBe(styles?.terminalLetterSpacing)
  expect(['normal', '0px']).toContain(styles?.terminalLetterSpacing)
  expect(['normal', '0px']).toContain(styles?.measureLetterSpacing)
  expect(styles?.hostPaddingLeft).toBe('0px')
  expect(styles?.hostPaddingRight).toBe('0px')
})
