/**
 * Same as debug-claude-input but runs against the DEV build (electron-vite dev
 * over CDP) so React StrictMode's double-mount is in effect — matches exactly
 * what the user sees when running `npm run dev`.
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

import {
  killAllConductorProcesses,
  conductordIsRunning,
  launchElectronApp,
  readTerminalText,
} from './real-helpers'

test.beforeAll(async () => {
  killAllConductorProcesses()
  await new Promise(r => setTimeout(r, 2000))
  fs.mkdirSync(path.join(os.homedir(), '.conductor'), { recursive: true })
})

test.afterAll(async () => {
  killAllConductorProcesses()
})

test('dev mode: type into claude-code tab', async () => {
  test.setTimeout(180_000)

  fs.mkdirSync('e2e/screenshots', { recursive: true })

  const { electronProcess, browser, page: window } = await launchElectronApp()

  // Pipe main-process logs
  electronProcess.stdout?.on('data', d => process.stdout.write(`[main] ${d}`))
  electronProcess.stderr?.on('data', d => process.stderr.write(`[main] ${d}`))
  window.on('console', msg => console.log(`[renderer ${msg.type()}]`, msg.text()))

  try {
    await window.waitForFunction(
      () => (window as any).__stores__?.layout?.getState().root !== null,
      null,
      { timeout: 20_000 },
    )

    // Reset
    await window.evaluate(() => {
      const { tabs, project, sidebar } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const [groupId, group] of Object.entries(groups) as any[]) {
        for (const tab of [...group.tabs]) tabs.getState().removeTab(groupId, tab.id)
      }
      project.getState().clearProject()
      sidebar.setState({ rootPath: null })
    })

    const tabId = await window.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const id = 'debug-claude-dev-1'
      tabs.getState().addTab(groupId, {
        id,
        type: 'claude-code',
        title: id,
        initialCommand: 'claude\n',
      })
      return id
    })
    console.log('tab created', tabId)

    await window.locator('.xterm').first().waitFor({ state: 'attached', timeout: 20_000 })

    let bannerSeen = false
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const text = await readTerminalText(window)
      if (text.includes('Claude Code v')) { bannerSeen = true; console.log(`banner after ${i + 1}s`); break }
    }
    expect(bannerSeen).toBe(true)

    await window.screenshot({ path: 'e2e/screenshots/dev-input-01-banner.png' })

    // Wait past autopilot auto-yes on the trust prompt
    await new Promise(r => setTimeout(r, 3000))
    await window.screenshot({ path: 'e2e/screenshots/dev-input-02-pre-type.png' })

    // Focus and type a unique marker string
    const marker = 'ZQXJ'
    await window.locator('.xterm-helper-textarea').first().focus()
    await new Promise(r => setTimeout(r, 200))

    const active = await window.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)
    console.log('activeElement:', active)

    await window.keyboard.type(marker)
    await new Promise(r => setTimeout(r, 1500))

    await window.screenshot({ path: 'e2e/screenshots/dev-input-03-after-type.png' })

    // Read just the xterm rows (not the whole page body)
    const rowsText = await window.evaluate(() => {
      const rows = document.querySelector('.xterm-rows')
      return rows?.textContent || ''
    })
    console.log('xterm-rows tail:', rowsText.slice(-500))

    const markerAppeared = rowsText.includes(marker)
    console.log(`marker "${marker}" appeared in terminal:`, markerAppeared)

    expect(markerAppeared).toBe(true)
  } finally {
    try { await browser.close() } catch {}
    electronProcess.kill('SIGKILL')
  }
})
