/**
 * Shared helpers for real Electron E2E tests (CDP-connected).
 *
 * Provides process cleanup, app launch, empty-project initialization,
 * and terminal reading utilities.
 */
import { expect } from '@playwright/test'
import { chromium, type Browser, type Page } from 'playwright'
import { execSync, spawn, type ChildProcess } from 'child_process'
import net from 'net'
import path from 'path'
import os from 'os'

export const APP_DIR = path.join(__dirname, '..')
export const CONDUCTORD_SOCKET = path.join(os.homedir(), '.conductor', 'conductord.sock')
export const CDP_PORT = 9222
export const HOME_DIR = os.homedir()

/**
 * Kill all stale Conductor processes: conductord, Electron, electron-vite.
 * Call this before and after every test run.
 */
export function killAllConductorProcesses(): void {
  if (process.platform === 'win32') {
    const targets = ['conductord.exe', 'electron.exe']
    for (const t of targets) {
      try { execSync(`taskkill /F /IM ${t}`, { stdio: 'ignore' }) } catch {}
    }
    // Also kill by window title pattern
    try { execSync('taskkill /F /FI "WINDOWTITLE eq electron-vite*"', { stdio: 'ignore' }) } catch {}
  } else {
    const cmds = [
      'pkill -f conductord 2>/dev/null',
      'pkill -f "Electron" 2>/dev/null',
      'pkill -f "electron-vite" 2>/dev/null',
    ]
    for (const cmd of cmds) {
      try { execSync(cmd, { stdio: 'ignore' }) } catch {}
    }
  }
}

/** Wait for conductord to become healthy. */
async function waitForDaemon(socketPath: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (process.platform === 'win32') {
        // On Windows, try connecting to a TCP health endpoint if available.
        // For now, just wait a fixed interval as the socket model differs.
        await new Promise(r => setTimeout(r, 2_000))
        return
      }
      execSync(`curl -sf --unix-socket "${socketPath}" http://localhost/health`, { timeout: 2_000 })
      return
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error(`Daemon did not become healthy within ${timeoutMs}ms`)
}

/** Check if conductord is healthy via its Unix socket (or TCP on Windows). */
export function conductordIsRunning(): boolean {
  try {
    if (process.platform === 'win32') {
      // Windows uses a different IPC transport; fall through to waitForDaemon instead
      return false
    }
    execSync(`curl -sf --unix-socket "${CONDUCTORD_SOCKET}" http://localhost/health`, {
      timeout: 2_000,
    })
    return true
  } catch {
    return false
  }
}

/** Read the visible terminal text from xterm's accessibility tree. */
export async function readTerminalText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tree = document.querySelector('.xterm-accessibility-tree')
    if (tree) return tree.textContent || ''
    return document.body.innerText
  })
}

/** Read terminal content from xterm rendered rows. */
export async function readTerminalRows(page: Page): Promise<string> {
  return page.evaluate(() => {
    const rows = document.querySelector('.xterm-rows')
    return rows?.textContent || ''
  })
}

/**
 * Launch Electron via electron-vite dev with CDP enabled.
 * Returns the Electron child process, browser, and page.
 */
export async function launchElectronApp(opts?: {
  env?: Record<string, string>
}): Promise<{ electronProcess: ChildProcess; browser: Browser; page: Page }> {
  const electronProcess = spawn('npx', ['electron-vite', 'dev', '--', `--remote-debugging-port=${CDP_PORT}`], {
    cwd: APP_DIR,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...opts?.env,
    },
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
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`)
  const context = browser.contexts()[0]

  // Wait for a page to appear
  let page: Page | undefined
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

  return { electronProcess, browser, page }
}

/**
 * Wait for the app's Zustand stores and layout to initialize,
 * then reset to an empty project with no tabs.
 *
 * Also ensures skipDangerousPermissions is OFF.
 */
export async function waitForAppAndResetToEmptyProject(page: Page): Promise<void> {
  // Wait for stores to initialize
  await page.waitForFunction(
    () => {
      const stores = (window as any).__stores__
      return stores && stores.layout.getState().root !== null
    },
    null,
    { timeout: 15_000 },
  )

  // Reset to empty project: clear all tabs, clear project, reset sidebar
  await page.evaluate(() => {
    const { tabs, layout, project, sidebar } = (window as any).__stores__

    // Remove all existing tabs
    const groups = tabs.getState().groups
    for (const [groupId, group] of Object.entries(groups) as any[]) {
      for (const tab of [...group.tabs]) {
        tabs.getState().removeTab(groupId, tab.id)
      }
    }

    // Clear project state
    project.getState().clearProject()

    // Clear sidebar root path
    sidebar.setState({ rootPath: null })
  })

  // Ensure skipDangerousPermissions is OFF via config patch
  await page.evaluate(() => {
    return window.electronAPI.patchConfig({
      aiCli: { claudeCode: { skipDangerousPermissions: false } }
    })
  })

  // Small delay for state to settle
  await new Promise(r => setTimeout(r, 300))
}

/**
 * Wait for conductord to become healthy (up to 15s).
 */
export async function waitForConductord(): Promise<void> {
  try {
    await waitForDaemon(CONDUCTORD_SOCKET, 15_000)
  } catch {
    expect(false).toBe(true) // fail the test with a clear message
  }
}

/**
 * Navigate the + menu: click + > Claude > Default to open a Claude Code tab.
 * Requires at least one tab to be visible (so the tab bar renders).
 */
export async function clickPlusClaudeDefault(page: Page): Promise<void> {
  // Ensure a tab exists so the tab bar is visible
  const tabCount = await page.evaluate(() => {
    const { tabs } = (window as any).__stores__
    const groups = tabs.getState().groups
    let count = 0
    for (const group of Object.values(groups) as any[]) {
      count += group.tabs.length
    }
    return count
  })

  if (tabCount === 0) {
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'Terminal' })
    })
  }

  // Wait for tab bar
  await page.locator('[style*="height: 36px"]').first().waitFor({ state: 'visible', timeout: 5_000 })

  // Click +
  const tabBar = page.locator('[style*="height: 36px"]').first()
  const plusBtn = tabBar.locator('button').last()
  await plusBtn.click()

  // Wait for menu
  await page.locator('[role="menuitem"]').first().waitFor({ state: 'visible', timeout: 3_000 })

  // Hover Claude > click Default
  const claudeSubmenu = page.locator('[role="menuitem"]', { hasText: 'Claude' }).first()
  await claudeSubmenu.hover()
  await new Promise(r => setTimeout(r, 500))

  const defaultItem = page.locator('[role="menuitem"]', { hasText: 'Default' })
  await defaultItem.waitFor({ state: 'visible', timeout: 5_000 })
  await defaultItem.click()

  // Wait for xterm
  await page.locator('.xterm').first().waitFor({ state: 'attached', timeout: 10_000 })
}

/**
 * Enable the autopilot toggle in the active Claude Code tab.
 * Verifies it turned on (red background).
 */
export async function enableAutopilot(page: Page): Promise<void> {
  const autopilotLabel = page.locator('label', { hasText: 'Auto-pilot' }).last()
  await autopilotLabel.waitFor({ state: 'visible', timeout: 10_000 })
  await autopilotLabel.click()

  const toggleBtn = autopilotLabel.locator('..').locator('button')
  await expect(toggleBtn).toHaveCSS('background-color', 'rgb(239, 68, 68)', { timeout: 2_000 })
}

/**
 * Wait for Claude Code to show its banner or prompt indicator.
 * Returns true if ready, false if timed out.
 */
export async function waitForClaudeReady(page: Page, timeoutS = 30): Promise<boolean> {
  for (let i = 0; i < timeoutS; i++) {
    await new Promise(r => setTimeout(r, 1_000))
    const text = await readTerminalText(page)
    const rowText = await readTerminalRows(page)
    const combined = text + '\n' + rowText

    if (combined.includes('Claude Code v') || combined.includes('trust this') || combined.includes('>') || combined.includes('❯')) {
      console.log(`Claude Code ready after ${i + 1}s`)
      return true
    }

    if (i % 5 === 4) {
      const snippet = combined.slice(-300).replace(/\s+/g, ' ').trim()
      console.log(`[${i + 1}s] Terminal: ...${snippet}`)
    }
  }

  const text = await readTerminalText(page)
  console.log('WARNING: Could not confirm Claude ready. Last text:', text.slice(-500))
  return false
}
