/**
 * E2E test: Autopilot auto-responds to yes/no prompts in a Claude Code tab.
 *
 * Connects Playwright to the real Electron app via CDP so we have full
 * access to window.electronAPI and conductord — no mocks.
 *
 * Steps:
 *   1. Launch Electron, reset to empty project with home dir ~/
 *   2. Click + > Claude > Default to open a Claude Code tab
 *   3. Enable autopilot (no --dangerously-skip-permissions)
 *   4. Send a prompt that triggers a tool-use confirmation
 *   5. Verify autopilot auto-approves the prompt
 */
import { test, expect } from '@playwright/test'
import type { Browser, Page } from 'playwright'
import type { ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

import {
  HOME_DIR,
  killAllConductorProcesses,
  launchElectronApp,
  waitForAppAndResetToEmptyProject,
  waitForConductord,
  clickPlusClaudeDefault,
  enableAutopilot,
  waitForClaudeReady,
  readTerminalText,
} from './real-helpers'

test.describe('Autopilot e2e – auto-approves Claude prompts', () => {
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

  test('autopilot approves tool-use prompt via + > Claude > Default', async () => {
    test.setTimeout(120_000)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-autopilot-e2e-'))
    const targetFile = path.join(tmpDir, 'hello.txt')

    try {
      // Reset to empty project and set home dir
      await waitForAppAndResetToEmptyProject(page)
      await page.evaluate((homeDir: string) => {
        const { sidebar } = (window as any).__stores__
        sidebar.getState().setRootPath(homeDir)
      }, HOME_DIR)

      await waitForConductord()

      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-01-ready.png' })

      // Click + > Claude > Default
      await clickPlusClaudeDefault(page)
      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-02-tab-created.png' })

      // Enable autopilot
      await enableAutopilot(page)
      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-03-autopilot-on.png' })

      // Wait for Claude to be ready
      await waitForClaudeReady(page)
      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-04-claude-ready.png' })

      // Find the Claude tab ID
      const tabId = await page.evaluate(() => {
        const { tabs } = (window as any).__stores__
        const groups = tabs.getState().groups
        for (const group of Object.values(groups) as any[]) {
          for (const tab of group.tabs) {
            if (tab.type === 'claude-code') return tab.id
          }
        }
        return null
      })
      expect(tabId).not.toBeNull()

      // Send a prompt that triggers a Write tool permission prompt
      const prompt = `create a file called ${targetFile} containing exactly the text "hello world". Use the full absolute path.`
      await page.evaluate(({ id, msg }) => {
        window.electronAPI.writeTerminal(id, msg + '\r')
      }, { id: tabId, msg: prompt })

      console.log('Prompt sent, waiting for autopilot to approve and file to be created...')
      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-05-prompt-sent.png' })

      // Poll for file creation
      let fileCreated = false
      for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 1_000))

        if (fs.existsSync(targetFile)) {
          fileCreated = true
          console.log(`File created after ${i + 1}s — autopilot approved the prompt!`)
          break
        }

        if (i % 15 === 14) {
          const text = await readTerminalText(page)
          const last500 = text.slice(-500).replace(/\s+/g, ' ').trim()
          console.log(`[${i + 1}s] Terminal: ...${last500}`)
          await page.screenshot({ path: `e2e/screenshots/autopilot-e2e-poll-${i + 1}s.png` })
        }
      }

      if (!fileCreated) {
        const text = await readTerminalText(page)
        console.log('FAIL: File was not created.')
        console.log('Final terminal text (last 1000 chars):')
        console.log(text.slice(-1000))
        await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-06-fail.png' })
      }

      expect(fileCreated).toBe(true)

      const content = fs.readFileSync(targetFile, 'utf-8')
      expect(content.toLowerCase()).toContain('hello')
      console.log(`File content: "${content.trim()}"`)

      await page.screenshot({ path: 'e2e/screenshots/autopilot-e2e-07-pass.png' })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
