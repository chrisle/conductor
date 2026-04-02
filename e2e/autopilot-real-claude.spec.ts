import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'

import {
  killAllConductorProcesses,
  readTerminalText,
} from './real-helpers'

// This test uses the real Claude CLI — it makes an API call.
// Requires `claude` to be installed and authenticated.
test('autopilot approves file creation from real Claude CLI', async () => {
  test.setTimeout(120_000)

  killAllConductorProcesses()
  await new Promise(r => setTimeout(r, 2000))

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-e2e-'))
  const targetFile = path.join(tmpDir, 'hello.txt')

  try {
    const app = await electron.launch({
      args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    })

    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Wait for layout to initialise
    await window.waitForFunction(() => {
      const stores = (window as any).__stores__
      return stores && stores.layout.getState().root !== null
    }, null, { timeout: 10000 })

    // Reset to empty project, ensure skipDangerousPermissions is OFF
    await window.evaluate(() => {
      const { tabs, layout, project, sidebar } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const [groupId, group] of Object.entries(groups) as any[]) {
        for (const tab of [...group.tabs]) {
          tabs.getState().removeTab(groupId, tab.id)
        }
      }
      project.getState().clearProject()
      sidebar.setState({ rootPath: null })
    })
    await window.evaluate(() => {
      return window.electronAPI.patchConfig({
        aiCli: { claudeCode: { skipDangerousPermissions: false } }
      })
    })

    // Add a Claude tab with the temp dir as cwd
    await window.evaluate((cwd: string) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, {
        type: 'claude-code',
        title: 'Claude E2E',
        filePath: cwd
        // uses default initialCommand: "claude\n"
      })
    }, tmpDir)

    // Enable autopilot ASAP — before Claude shows any prompts
    const autopilotLabel = window.locator('label', { hasText: 'Auto-pilot' })
    await autopilotLabel.waitFor({ state: 'visible', timeout: 10_000 })
    await autopilotLabel.click()

    // Verify autopilot is actually on (red = #ef4444)
    const toggleBtn = autopilotLabel.locator('..').locator('button')
    await expect(toggleBtn).toHaveCSS('background-color', 'rgb(239, 68, 68)', { timeout: 2_000 })

    // Wait for Claude to be ready, then send the prompt.
    const tabId = await window.evaluate(() => {
      const { tabs } = (window as any).__stores__
      const groups = tabs.getState().groups
      for (const group of Object.values(groups) as any[]) {
        for (const tab of group.tabs) {
          if (tab.title === 'Claude E2E') return tab.id
        }
      }
      return null
    })
    expect(tabId).not.toBeNull()

    // Wait for Claude to show its interactive prompt (up to 15s)
    let claudeReady = false
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500))
      const text = await readTerminalText(window)
      if (text.includes('>') || text.includes('❯') || text.includes('help')) {
        claudeReady = true
        break
      }
    }
    console.log(`Claude ready: ${claudeReady}`)

    // Send the prompt that will trigger file creation
    const prompt = 'create a file called hello.txt containing exactly the text hello world'
    await window.evaluate(({ id, msg }) => {
      window.electronAPI.writeTerminal(id, msg + '\r')
    }, { id: tabId, msg: prompt })

    console.log('Prompt sent, waiting for file creation...')

    // Poll the filesystem for the file Claude should create.
    let fileCreated = false
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 1000))

      if (fs.existsSync(targetFile)) {
        fileCreated = true
        console.log(`File created after ${i + 1}s`)
        break
      }

      if (i % 15 === 14) {
        const text = await readTerminalText(window)
        const last500 = text.slice(-500).replace(/\s+/g, ' ').trim()
        console.log(`[${i + 1}s] Terminal: ...${last500}`)
      }
    }

    if (!fileCreated) {
      const text = await readTerminalText(window)
      console.log('FINAL terminal text (last 1000 chars):')
      console.log(text.slice(-1000))
    }

    expect(fileCreated).toBe(true)

    // Verify the file has the expected content
    const content = fs.readFileSync(targetFile, 'utf-8')
    expect(content.toLowerCase()).toContain('hello')
    console.log(`File content: ${content.trim()}`)

    await app.close()
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
