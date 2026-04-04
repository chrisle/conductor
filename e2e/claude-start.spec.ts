/**
 * E2E test: Clicking + → Claude → Default must start Claude Code.
 *
 * Connects Playwright to the real Electron app via CDP so we have full
 * access to window.electronAPI and conductord — no mocks.
 *
 * Catches the regression where clicking "+" drops into a bare shell
 * instead of launching Claude Code.
 */
import { test, expect } from '@playwright/test'
import type { Browser, Page } from 'playwright'
import type { ChildProcess } from 'child_process'

import {
  killAllConductorProcesses,
  launchElectronApp,
  waitForAppAndResetToEmptyProject,
  waitForConductord,
  clickPlusClaudeDefault,
  readTerminalText,
  readTerminalRows,
} from './real-helpers'

test.describe('Claude Code launch via + button', () => {
  let electronProcess: ChildProcess
  let browser: Browser
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(90_000)

    killAllConductorProcesses()
    await new Promise(r => setTimeout(r, 2000))

    const app = await launchElectronApp()
    electronProcess = app.electronProcess
    browser = app.browser
    page = app.page
  })

  test.afterAll(async () => {
    try { await browser?.close() } catch {}
    if (electronProcess) {
      electronProcess.kill('SIGKILL')
    }
    killAllConductorProcesses()
  })

  test('clicking + > Claude > Default starts Claude Code', async () => {
    test.setTimeout(60_000)

    // Start with empty project
    await waitForAppAndResetToEmptyProject(page)
    await waitForConductord()

    await page.screenshot({ path: 'e2e/screenshots/claude-start-01-ready.png' })

    // Click + > Claude > Default
    await clickPlusClaudeDefault(page)
    await page.screenshot({ path: 'e2e/screenshots/claude-start-02-tab-created.png' })

    // Poll terminal output for Claude Code banner or workspace trust prompt.
    let claudeStarted = false
    let lastText = ''
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1_000))

      const text = await readTerminalText(page)
      const rowText = await readTerminalRows(page)
      const combined = text + '\n' + rowText

      if (combined.includes('Claude Code v') || combined.includes('trust this')) {
        claudeStarted = true
        console.log(`Claude Code started after ${i + 1}s`)
        break
      }

      lastText = combined

      if (i % 5 === 4) {
        const snippet = combined.slice(-300).replace(/\s+/g, ' ').trim()
        console.log(`[${i + 1}s] Terminal: ...${snippet}`)
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/claude-start-03-result.png' })

    if (!claudeStarted) {
      console.log('FAIL: Claude Code did not start. Last terminal output (last 1000 chars):')
      console.log(lastText.slice(-1000))

      const looksLikeShellOnly = /[$#%>]\s*$/.test(lastText.trim()) && !lastText.includes('claude')
      if (looksLikeShellOnly) {
        console.log('REGRESSION DETECTED: Terminal shows a bare shell prompt — Claude was not launched.')
      }
    }

    expect(claudeStarted).toBe(true)
  })
})
