/**
 * E2E test: Clicking + → Claude → Default must start Claude Code.
 *
 * Connects Playwright to the real Electron app via CDP so we have full
 * access to window.electronAPI, conductord, and tmux — no mocks.
 *
 * Catches the regression where clicking "+" drops into a bare shell
 * instead of launching Claude Code.
 */
import { test, expect } from '@playwright/test'
import { chromium, type Browser, type Page } from 'playwright'
import { execSync, spawn, type ChildProcess } from 'child_process'
import path from 'path'
import os from 'os'

const APP_DIR = path.join(__dirname, '..')
const CONDUCTORD_SOCKET = path.join(os.homedir(), '.conductor', 'conductord.sock')
const CDP_PORT = 9222
const TMUX_BIN = path.join(os.homedir(), 'Library', 'Caches', 'conductor', 'tmux', 'tmux')

/** Kill stale processes from previous runs. */
function cleanup() {
  const cmds = [
    'pkill -f conductord 2>/dev/null',
    'pkill -f "Electron" 2>/dev/null',
    'pkill -f "electron-vite" 2>/dev/null',
    `${TMUX_BIN} -u -L conductor kill-server 2>/dev/null`,
  ]
  for (const cmd of cmds) {
    try { execSync(cmd, { stdio: 'ignore' }) } catch {}
  }
}

/** Wait until conductord is healthy. */
function conductordIsRunning(): boolean {
  try {
    execSync(`curl -sf --unix-socket "${CONDUCTORD_SOCKET}" http://localhost/health`, {
      timeout: 2_000,
    })
    return true
  } catch {
    return false
  }
}

/** Read the visible terminal text from xterm's accessibility tree. */
async function readTerminalText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tree = document.querySelector('.xterm-accessibility-tree')
    if (tree) return tree.textContent || ''
    return document.body.innerText
  })
}

/**
 * Read terminal content from xterm rows (rendered cells).
 * More reliable than accessibility tree for checking actual rendered output.
 */
async function readTerminalRows(page: Page): Promise<string> {
  return page.evaluate(() => {
    const rows = document.querySelector('.xterm-rows')
    return rows?.textContent || ''
  })
}

test.describe('Claude Code launch via + button', () => {
  let electronProcess: ChildProcess
  let browser: Browser
  let page: Page

  test.beforeAll(async () => {
    test.setTimeout(90_000)

    // Clean up stale processes
    cleanup()
    // Allow processes to fully exit
    await new Promise(r => setTimeout(r, 2000))

    // Launch Electron with CDP
    electronProcess = spawn('npx', ['electron-vite', 'dev', '--', `--remote-debugging-port=${CDP_PORT}`], {
      cwd: APP_DIR,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    })

    // Wait for CDP to be available
    let cdpReady = false
    for (let i = 0; i < 30; i++) {
      try {
        execSync(`curl -sf http://localhost:${CDP_PORT}/json/version`, { timeout: 2000 })
        cdpReady = true
        break
      } catch {}
      await new Promise(r => setTimeout(r, 1000))
    }
    if (!cdpReady) throw new Error(`CDP not available on port ${CDP_PORT} after 30s`)

    // Connect Playwright via CDP
    browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
    const context = browser.contexts()[0]

    // Wait for a page to appear
    for (let i = 0; i < 20; i++) {
      const pages = context.pages()
      if (pages.length > 0) {
        page = pages[0]
        break
      }
      await new Promise(r => setTimeout(r, 500))
    }
    if (!page) throw new Error('No Electron page found via CDP')

    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    try { await browser?.close() } catch {}
    if (electronProcess) {
      electronProcess.kill('SIGKILL')
    }
    cleanup()
  })

  test('clicking + > Claude > Default starts Claude Code', async () => {
    test.setTimeout(60_000)

    // Wait for Zustand stores and layout to initialize
    await page.waitForFunction(
      () => {
        const stores = (window as any).__stores__
        return stores && stores.layout.getState().root !== null
      },
      null,
      { timeout: 15_000 },
    )

    // Wait for conductord to be healthy before trying to create sessions
    let healthy = false
    for (let i = 0; i < 15; i++) {
      if (conductordIsRunning()) {
        healthy = true
        break
      }
      await new Promise(r => setTimeout(r, 1000))
    }
    expect(healthy).toBe(true)

    await page.screenshot({ path: 'e2e/screenshots/claude-start-01-ready.png' })

    // Add a throwaway terminal tab so the tab bar with + button is visible
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'Terminal' })
    })

    // Wait for tab bar to render (the thin strip at the top)
    await page.locator('[style*="height: 36px"]').first().waitFor({ state: 'visible', timeout: 5_000 })

    // Click the + (new tab) button — it's the last button in the tab bar
    const tabBar = page.locator('[style*="height: 36px"]').first()
    const plusBtn = tabBar.locator('button').last()
    await plusBtn.click()

    // Wait for the dropdown menu to appear
    await page.locator('[role="menuitem"]').first().waitFor({ state: 'visible', timeout: 3_000 })
    await page.screenshot({ path: 'e2e/screenshots/claude-start-02-menu.png' })

    // Hover "Claude" to open the submenu, then click "Default"
    const claudeSubmenu = page.locator('[role="menuitem"]', { hasText: 'Claude' }).first()
    await claudeSubmenu.hover()
    const defaultItem = page.locator('[role="menuitem"]', { hasText: 'Default' })
    await defaultItem.waitFor({ state: 'visible', timeout: 3_000 })
    await page.screenshot({ path: 'e2e/screenshots/claude-start-03-submenu.png' })
    await defaultItem.click()

    // Wait for xterm to mount
    await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 10_000 })
    await page.screenshot({ path: 'e2e/screenshots/claude-start-04-tab-created.png' })

    // Poll terminal output for Claude Code banner or workspace trust prompt.
    // "Claude Code v" = welcome banner, "trust this" = workspace trust prompt.
    // Either confirms Claude actually launched (not just dropped to a shell).
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

    await page.screenshot({ path: 'e2e/screenshots/claude-start-05-result.png' })

    if (!claudeStarted) {
      console.log('FAIL: Claude Code did not start. Last terminal output (last 1000 chars):')
      console.log(lastText.slice(-1000))

      // Check if we just got a bare shell prompt (the regression symptom)
      const looksLikeShellOnly = /[$#%>]\s*$/.test(lastText.trim()) && !lastText.includes('claude')
      if (looksLikeShellOnly) {
        console.log('REGRESSION DETECTED: Terminal shows a bare shell prompt — Claude was not launched.')
      }
    }

    expect(claudeStarted).toBe(true)
  })
})
