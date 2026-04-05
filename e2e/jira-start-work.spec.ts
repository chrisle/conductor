/**
 * Temporary E2E test: Jira Start Work → Claude tab with autopilot
 *
 * Connects to real Electron via CDP. Opens the CON board, waits for
 * tickets to load, then triggers Start Work on CON-4 via the UI.
 * Verifies a Claude Code tab opens with autopilot ON and Claude starts.
 */
import { test, expect } from '@playwright/test'
import type { Browser, Page } from 'playwright'
import type { ChildProcess } from 'child_process'

import {
  killAllConductorProcesses,
  launchElectronApp,
  waitForConductord,
  readTerminalText,
  readTerminalRows,
} from './real-helpers'

test.describe('Jira Start Work – CON-4', () => {
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

  test('CON-4 Start Work opens Claude tab with autopilot', async () => {
    test.setTimeout(120_000)

    // 1. Wait for stores to initialize
    await page.waitForFunction(
      () => {
        const stores = (window as any).__stores__
        return stores && stores.layout.getState().root !== null
      },
      null,
      { timeout: 15_000 },
    )
    await waitForConductord()

    // 2. Clear existing tabs, set rootPath
    await page.evaluate(() => {
      const { tabs, sidebar } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const [groupId, group] of Object.entries(groups) as any[]) {
        for (const tab of [...group.tabs]) {
          tabs.getState().removeTab(groupId, tab.id)
        }
      }
      sidebar.getState().setRootPath('/Users/chrisle/code/conductor')
    })
    await new Promise(r => setTimeout(r, 300))
    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-01-ready.png' })

    // 3. Open the CON board tab
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, {
        type: 'jira-board',
        title: 'CON Board',
        content: 'CON',
      })
    })

    // 4. Wait for board to load (CON-4 appears)
    const con4Btn = page.locator('button', { hasText: 'CON-4' }).first()
    await con4Btn.waitFor({ state: 'visible', timeout: 30_000 })
    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-02-board.png' })

    // 5. Click Worktree > Start Work on CON-4
    //    Scroll CON-4 into view first
    await con4Btn.scrollIntoViewIfNeeded()
    await new Promise(r => setTimeout(r, 200))

    // Find and click the Worktree button in CON-4's card using Playwright locators
    // The Worktree button is inside the same card as CON-4
    // Strategy: find the nearest Worktree button after CON-4 in DOM order
    const worktreeBtnIndex = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'))
      const con4Idx = allButtons.findIndex(b => b.textContent?.trim() === 'CON-4')
      if (con4Idx === -1) throw new Error('CON-4 not found')
      // The Worktree button is a few buttons after CON-4 in the same card
      for (let i = con4Idx + 1; i < Math.min(con4Idx + 15, allButtons.length); i++) {
        if (allButtons[i].textContent?.includes('Worktree')) {
          // Return the global index among all Worktree buttons
          const worktreeButtons = allButtons.filter(b => b.textContent?.includes('Worktree'))
          return worktreeButtons.indexOf(allButtons[i])
        }
      }
      throw new Error('Worktree button not found after CON-4')
    })

    const worktreeBtn = page.locator('button', { hasText: 'Worktree' }).nth(worktreeBtnIndex)
    await worktreeBtn.click()

    // Wait for and click "Start work" menu item
    const startWorkItem = page.locator('[role="menuitem"]', { hasText: 'Start work' })
    await startWorkItem.waitFor({ state: 'visible', timeout: 5_000 })
    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-03-menu.png' })
    await startWorkItem.click()

    // 6. Wait for Claude tab to appear in the store
    await new Promise(r => setTimeout(r, 2000))
    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-04-clicked.png' })

    const claudeTab = await page.waitForFunction(() => {
      const { tabs } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const group of Object.values(groups) as any[]) {
        for (const tab of group.tabs) {
          if (tab.type === 'claude-code' && (tab.id === 't-CON-4' || tab.title?.includes('CON-4'))) {
            return {
              id: tab.id,
              title: tab.title,
              autoPilot: tab.autoPilot,
              initialCommand: tab.initialCommand,
              type: tab.type,
            }
          }
        }
      }
      return null
    }, null, { timeout: 15_000 })

    const tabData = await claudeTab.jsonValue() as any
    console.log('Claude tab created:', JSON.stringify(tabData, null, 2))

    // 7. Verify tab properties
    expect(tabData).not.toBeNull()
    expect(tabData.type).toBe('claude-code')
    expect(tabData.title).toContain('CON-4')
    expect(tabData.autoPilot).toBe(true)
    expect(tabData.initialCommand).toContain('claude')
    expect(tabData.initialCommand).toContain('--dangerously-skip-permissions')
    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-05-tab.png' })

    // 8. Wait for xterm to mount
    await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 15_000 })

    // 9. Verify autopilot is ON in the UI
    const autopilotToggle = page.locator('label', { hasText: /fuck/i }).last()
    await autopilotToggle.waitFor({ state: 'visible', timeout: 10_000 })
    const toggleBtn = autopilotToggle.locator('..').locator('button')
    await expect(toggleBtn).toHaveCSS('background-color', 'rgb(239, 68, 68)', { timeout: 5_000 })
    console.log('Autopilot toggle confirmed ON')

    // 10. Wait for Claude Code to actually start
    let claudeStarted = false
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1_000))
      const text = await readTerminalText(page)
      const rows = await readTerminalRows(page)
      const combined = text + '\n' + rows

      if (combined.includes('Claude Code') || combined.includes('❯')) {
        claudeStarted = true
        console.log(`Claude Code started after ${i + 1}s`)
        break
      }
      if (combined.includes('number expected') || combined.includes('Process exited')) {
        console.error('FAIL: Process crashed. Terminal:', combined.slice(0, 300))
        await page.screenshot({ path: 'e2e/screenshots/jira-start-work-FAIL.png' })
        break
      }
      if (i % 10 === 9) {
        const snippet = combined.slice(-200).replace(/\s+/g, ' ').trim()
        console.log(`[${i + 1}s] waiting for Claude... ${snippet}`)
      }
    }

    await page.screenshot({ path: 'e2e/screenshots/jira-start-work-06-final.png' })
    expect(claudeStarted).toBe(true)
    console.log('SUCCESS: Claude Code started with autopilot for CON-4')
  })
})
