/**
 * E2E test: Autopilot auto-approves tool-use prompts with Claude in Haiku model.
 *
 * Launches real Electron via CDP, resets to empty project, opens a Claude Code
 * tab with --model haiku, asks Claude to write code (triggers Write tool
 * permission), and verifies autopilot auto-approves — WITHOUT
 * --dangerously-skip-permissions.
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
  enableAutopilot,
  waitForClaudeReady,
  readTerminalText,
} from './real-helpers'

test.describe('Autopilot e2e – Haiku model writes code', () => {
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

  test('haiku writes a file and autopilot approves the Write tool prompt', async () => {
    test.setTimeout(120_000)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-haiku-e2e-'))
    const targetFile = path.join(tmpDir, 'fizzbuzz.js')

    try {
      // Reset to empty project and set home dir
      await waitForAppAndResetToEmptyProject(page)
      await page.evaluate((homeDir: string) => {
        const { sidebar } = (window as any).__stores__
        sidebar.getState().setRootPath(homeDir)
      }, HOME_DIR)

      await waitForConductord()

      // Add a Claude Code tab with --model haiku (no --dangerously-skip-permissions)
      const newTabId = await page.evaluate((cwd: string) => {
        const { tabs, layout } = (window as any).__stores__
        const groupId = layout.getState().getAllGroupIds()[0]
        return tabs.getState().addTab(groupId, {
          type: 'claude-code',
          title: 'Claude Haiku',
          filePath: cwd,
          initialCommand: 'claude --model claude-haiku-4-5-20251001\n',
        })
      }, HOME_DIR)

      // Wait for xterm
      await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 10_000 })

      // Enable autopilot
      await enableAutopilot(page)
      await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-01-autopilot-on.png' })

      // Wait for Claude to be ready
      await waitForClaudeReady(page)
      await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-02-claude-ready.png' })

      // Use the tab ID returned directly from addTab
      const tabId = newTabId
      expect(tabId).not.toBeNull()

      // Ask Haiku to write fizzbuzz — triggers Write tool permission prompt
      const prompt = `Write a fizzbuzz function in JavaScript and save it to ${targetFile}. Use the exact absolute path. The function should print numbers 1-20 with fizz/buzz replacements.`
      await page.evaluate(({ id, msg }) => {
        window.electronAPI.writeTerminal(id, msg + '\r')
      }, { id: tabId, msg: prompt })

      console.log('Prompt sent to Haiku, waiting for autopilot to approve Write tool...')
      await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-03-prompt-sent.png' })

      // Register a listener for the autopilot_match event — conductord sends
      // this the instant it detects a prompt, BEFORE sending the auto-response
      // (which follows after a 150ms delay). We take a screenshot from within
      // the callback itself so it fires before the prompt is dismissed.
      await page.evaluate(() => {
        (window as any).__autopilotMatches__ = []
        ;(window as any).__autopilotScreenshotReady__ = false
        window.electronAPI.onAutopilotMatch((_event: any, id: string, response: string) => {
          (window as any).__autopilotMatches__.push({ id, response, time: Date.now() })
          ;(window as any).__autopilotScreenshotReady__ = true
        })
      })

      // Fast-poll every 50ms watching for the autopilot_match callback.
      // Take a screenshot the instant we see it — the permission prompt
      // should still be on screen (conductord waits 150ms before sending the keypress).
      let autopilotMatched = false
      let fileCreated = false
      const deadline = Date.now() + 90_000

      while (Date.now() < deadline) {
        // Fast-poll for autopilot match (50ms) until we capture the prompt screenshot
        if (!autopilotMatched) {
          const ready = await page.evaluate(() => (window as any).__autopilotScreenshotReady__)
          if (ready) {
            autopilotMatched = true
            // Take screenshot immediately — prompt should still be visible
            await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-04-prompt-detected.png' })
            const matches = await page.evaluate(() => (window as any).__autopilotMatches__)
            console.log(`Autopilot matched prompt — response: ${JSON.stringify(matches[0].response)}`)
          }
        }

        if (fs.existsSync(targetFile)) {
          fileCreated = true
          const elapsed = Math.round((90_000 - (deadline - Date.now())) / 1000)
          console.log(`File created after ~${elapsed}s — autopilot approved the Write tool!`)
          await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-05-file-created.png' })
          break
        }

        // Use 50ms polls while waiting for match, 1s polls after
        await new Promise(r => setTimeout(r, autopilotMatched ? 1_000 : 50))
      }

      if (!fileCreated) {
        const text = await readTerminalText(page)
        console.log('FAIL: File was not created.')
        console.log('Final terminal text (last 1000 chars):')
        console.log(text.slice(-1000))
        await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-04-fail.png' })
      }

      expect(fileCreated).toBe(true)

      const content = fs.readFileSync(targetFile, 'utf-8')
      console.log(`File content (first 500 chars):\n${content.slice(0, 500)}`)
      expect(content.toLowerCase()).toContain('fizz')
      expect(content.toLowerCase()).toContain('buzz')

      await page.screenshot({ path: 'e2e/screenshots/autopilot-haiku-05-pass.png' })
      console.log('Haiku autopilot test passed!')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
