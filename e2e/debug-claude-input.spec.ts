/**
 * Debug test: can user type into a claude-code tab?
 *
 * Launches the built Electron app, opens a Claude Code (Default) tab via the
 * new-tab menu, waits for claude's banner to appear, then attempts to send a
 * single keystroke two different ways (keyboard.type and direct
 * writeTerminal) and checks whether anything arrives at claude's input.
 */
import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { type ChildProcess, spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

import {
  CONDUCTORD_SOCKET,
  killAllConductorProcesses,
  conductordIsRunning,
  readTerminalText,
} from './real-helpers'

const CONDUCTORD_BIN = path.join(__dirname, '..', 'conductord', 'conductord')

let conductordProcess: ChildProcess | null = null

test.beforeAll(async () => {
  killAllConductorProcesses()
  await new Promise(r => setTimeout(r, 1500))

  if (!conductordIsRunning()) {
    fs.mkdirSync(path.join(os.homedir(), '.conductor'), { recursive: true })
    conductordProcess = spawn(CONDUCTORD_BIN, ['-socket', CONDUCTORD_SOCKET], {
      stdio: 'pipe',
      detached: true,
    })
    conductordProcess.stdout?.on('data', d => process.stdout.write(`[conductord] ${d}`))
    conductordProcess.stderr?.on('data', d => process.stderr.write(`[conductord] ${d}`))
    conductordProcess.unref()
    for (let i = 0; i < 30; i++) {
      if (conductordIsRunning()) break
      await new Promise(r => setTimeout(r, 200))
    }
    if (!conductordIsRunning()) throw new Error('conductord failed to start')
  }
})

test.afterAll(async () => {
  if (conductordProcess) conductordProcess.kill()
  killAllConductorProcesses()
})

test('type into claude-code tab and verify PTY receives it', async () => {
  test.setTimeout(90_000)

  fs.mkdirSync('e2e/screenshots', { recursive: true })

  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Forward renderer console to test output
    window.on('console', msg => console.log(`[renderer ${msg.type()}]`, msg.text()))

    // Wait for layout store
    await window.waitForFunction(
      () => (window as any).__stores__?.layout?.getState().root !== null,
      null,
      { timeout: 10_000 },
    )

    // Reset to empty
    await window.evaluate(() => {
      const { tabs, project, sidebar } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const [groupId, group] of Object.entries(groups) as any[]) {
        for (const tab of [...group.tabs]) tabs.getState().removeTab(groupId, tab.id)
      }
      project.getState().clearProject()
      sidebar.setState({ rootPath: null })
    })

    // Create a claude-code tab directly via the store (skip menu UI)
    const tabId = await window.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const id = 'debug-claude-1'
      tabs.getState().addTab(groupId, {
        id,
        type: 'claude-code',
        title: id,
        initialCommand: 'claude\n',
      })
      return id
    })

    console.log('created tab', tabId)

    // Wait for xterm
    await window.locator('.xterm').first().waitFor({ state: 'attached', timeout: 10_000 })
    await window.screenshot({ path: 'e2e/screenshots/input-01-tab-created.png' })

    // Wait for claude banner
    let bannerSeen = false
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const text = await readTerminalText(window)
      if (text.includes('Claude Code v') || text.includes('trust this') || text.includes('bypass')) {
        bannerSeen = true
        console.log(`claude banner after ${i + 1}s`)
        break
      }
      if (i % 5 === 4) console.log(`[${i + 1}s] waiting for claude…`)
    }
    expect(bannerSeen).toBe(true)

    await window.screenshot({ path: 'e2e/screenshots/input-02-banner-visible.png' })

    const beforeText = await readTerminalText(window)
    console.log('--- BEFORE typing (last 300 chars) ---')
    console.log(beforeText.slice(-300))

    // Method 1: direct writeTerminal via electronAPI
    console.log('\n--- TEST 1: writeTerminal("debug-claude-1", "X") ---')
    await window.evaluate((id) => (window as any).electronAPI.writeTerminal(id, 'X'), tabId)
    await new Promise(r => setTimeout(r, 1500))
    const afterWrite1 = await readTerminalText(window)
    const write1Worked = afterWrite1 !== beforeText
    console.log('after writeTerminal X, text changed?', write1Worked)
    console.log('tail:', afterWrite1.slice(-300))
    await window.screenshot({ path: 'e2e/screenshots/input-03-after-writeTerminal.png' })

    // Method 2: keyboard type (simulates real user typing)
    console.log('\n--- TEST 2: keyboard.type("Y") ---')
    // Click on the terminal to focus xterm first
    await window.locator('.xterm-helper-textarea').first().focus()
    await new Promise(r => setTimeout(r, 200))

    const activeElBefore = await window.evaluate(() => document.activeElement?.tagName + '.' + document.activeElement?.className)
    console.log('activeElement before type:', activeElBefore)

    await window.keyboard.type('Y')
    await new Promise(r => setTimeout(r, 1500))
    const afterType = await readTerminalText(window)
    const typeWorked = afterType !== afterWrite1
    console.log('after keyboard.type Y, text changed?', typeWorked)
    console.log('tail:', afterType.slice(-300))
    await window.screenshot({ path: 'e2e/screenshots/input-04-after-keyboardType.png' })

    // Method 3: shift+tab
    console.log('\n--- TEST 3: keyboard.press("Shift+Tab") ---')
    const beforeShiftTab = afterType
    await window.keyboard.press('Shift+Tab')
    await new Promise(r => setTimeout(r, 1500))
    const afterShiftTab = await readTerminalText(window)
    const shiftTabWorked = afterShiftTab !== beforeShiftTab
    console.log('after Shift+Tab, text changed?', shiftTabWorked)
    console.log('tail:', afterShiftTab.slice(-500))
    await window.screenshot({ path: 'e2e/screenshots/input-05-after-shiftTab.png' })

    console.log('\n=== RESULTS ===')
    console.log('writeTerminal worked:', write1Worked)
    console.log('keyboard.type worked:', typeWorked)
    console.log('Shift+Tab worked:', shiftTabWorked)
  } finally {
    app.process().kill('SIGKILL')
  }
})
