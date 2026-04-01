import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { execSync, type ChildProcess, spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'

const CONDUCTORD_BIN = path.join(__dirname, '..', 'conductord', 'conductord')
const CONDUCTORD_SOCKET = path.join(os.homedir(), '.conductor', 'conductord.sock')

/**
 * Read the current terminal screen text from the xterm accessibility tree.
 */
async function readTerminalText(window: any): Promise<string> {
  return await window.evaluate(() => {
    const tree = document.querySelector('.xterm-accessibility-tree')
    if (tree) return tree.textContent || ''
    return document.body.innerText
  })
}

function conductordIsRunning(): boolean {
  try {
    execSync(`curl -s --unix-socket "${CONDUCTORD_SOCKET}" http://localhost/health`, {
      timeout: 2_000,
    })
    return true
  } catch {
    return false
  }
}

let conductordProcess: ChildProcess | null = null
let conductordWasRunning = false

test.beforeAll(async () => {
  if (conductordIsRunning()) {
    conductordWasRunning = true
    return
  }
  fs.mkdirSync(path.join(os.homedir(), '.conductor'), { recursive: true })
  conductordProcess = spawn(CONDUCTORD_BIN, ['-socket', CONDUCTORD_SOCKET], {
    stdio: 'ignore',
    detached: true,
  })
  conductordProcess.unref()
  for (let i = 0; i < 30; i++) {
    if (conductordIsRunning()) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('conductord failed to start within 6s')
})

test.afterAll(async () => {
  if (conductordProcess && !conductordWasRunning) {
    conductordProcess.kill()
  }
})

test('New Tab > Claude > Default starts Claude Code', async () => {
  test.setTimeout(60_000)

  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Wait for layout to initialise
    await window.waitForFunction(
      () => {
        const stores = (window as any).__stores__
        return stores && stores.layout.getState().root !== null
      },
      null,
      { timeout: 10_000 },
    )

    await window.screenshot({ path: 'e2e/screenshots/real-claude-01-app-ready.png' })

    // Add a throwaway terminal tab so the tab bar is visible
    await window.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'Terminal' })
    })

    await window.locator('[style*="height: 36px"]').first().waitFor({ state: 'visible', timeout: 5_000 })

    // Click the + (new tab) button
    const tabBar = window.locator('[style*="height: 36px"]').first()
    const plusBtn = tabBar.locator('button').last()
    await plusBtn.click()

    // Wait for menu
    await window.locator('[role="menuitem"]').first().waitFor({ state: 'visible', timeout: 3_000 })
    await window.screenshot({ path: 'e2e/screenshots/real-claude-02-menu-open.png' })

    // Hover "Claude" to open the submenu, then click "Default"
    const claudeSubmenu = window.locator('[role="menuitem"]', { hasText: 'Claude' }).first()
    await claudeSubmenu.hover()
    const defaultItem = window.locator('[role="menuitem"]', { hasText: 'Default' })
    await defaultItem.waitFor({ state: 'visible', timeout: 3_000 })
    await window.screenshot({ path: 'e2e/screenshots/real-claude-03-submenu.png' })
    await defaultItem.click()

    // Wait for the Claude Code tab's xterm to mount
    await window.locator('.xterm').first().waitFor({ state: 'attached', timeout: 10_000 })
    await window.screenshot({ path: 'e2e/screenshots/real-claude-04-tab-created.png' })

    // Poll until Claude Code shows its banner or trust prompt.
    // "Claude Code v" = welcome banner, "trust this" = workspace trust prompt.
    // Either confirms claude launched successfully.
    let claudeStarted = false
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1_000))

      const text = await readTerminalText(window)
      if (text.includes('Claude Code v') || text.includes('trust this')) {
        claudeStarted = true
        console.log(`Claude Code started after ${i + 1}s`)
        break
      }

      if (i % 5 === 4) {
        const snippet = text.slice(-300).replace(/\s+/g, ' ').trim()
        console.log(`[${i + 1}s] Terminal: ...${snippet}`)
      }
    }

    await window.screenshot({ path: 'e2e/screenshots/real-claude-05-claude-running.png' })

    if (!claudeStarted) {
      const text = await readTerminalText(window)
      console.log('FINAL terminal text (last 1000 chars):')
      console.log(text.slice(-1000))
    }

    expect(claudeStarted).toBe(true)
  } finally {
    // Force-kill the Electron process — app.close() can hang if tmux
    // sessions are still running inside conductord.
    app.process().kill('SIGKILL')
  }
})
