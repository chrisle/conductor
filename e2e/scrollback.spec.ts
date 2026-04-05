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

  test('scrollback mock APIs are available', async ({ page }) => {
    // Verify the scrollback mock APIs exist on electronAPI
    const hasAPIs = await page.evaluate(() => {
      return typeof window.electronAPI.scrollbackSave === 'function' &&
             typeof window.electronAPI.scrollbackLoad === 'function' &&
             typeof window.electronAPI.scrollbackCleanup === 'function'
    })
    expect(hasAPIs).toBe(true)
  })

  test('scrollback save and load round-trips data', async ({ page }) => {
    // Test the mock scrollback IPC directly
    const result = await page.evaluate(async () => {
      await window.electronAPI.scrollbackSave('test-session', 0, 'chunk-0-data')
      await window.electronAPI.scrollbackSave('test-session', 1, 'chunk-1-data')

      const chunk0 = await window.electronAPI.scrollbackLoad('test-session', 0)
      const chunk1 = await window.electronAPI.scrollbackLoad('test-session', 1)
      const chunkMissing = await window.electronAPI.scrollbackLoad('test-session', 99)

      return { chunk0, chunk1, chunkMissing }
    })

    expect(result.chunk0).toBe('chunk-0-data')
    expect(result.chunk1).toBe('chunk-1-data')
    expect(result.chunkMissing).toBeNull()
  })

  test('scrollback cleanup removes session data', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await window.electronAPI.scrollbackSave('cleanup-test', 0, 'data')
      const before = await window.electronAPI.scrollbackLoad('cleanup-test', 0)

      await window.electronAPI.scrollbackCleanup('cleanup-test')
      const after = await window.electronAPI.scrollbackLoad('cleanup-test', 0)

      return { before, after }
    })

    expect(result.before).toBe('data')
    expect(result.after).toBeNull()
  })
})
