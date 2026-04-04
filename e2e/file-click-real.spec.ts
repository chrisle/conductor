/**
 * Real Electron E2E: Verify clicking a file in the file explorer opens a tab.
 *
 * Connects to the actual Electron app via CDP — no mocks.
 * Creates a temp directory with test files, points the sidebar at it,
 * clicks a file, and verifies a tab opens.
 */
import { test, expect } from '@playwright/test'
import type { Browser, Page } from 'playwright'
import type { ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

import {
  killAllConductorProcesses,
  launchElectronApp,
  waitForAppAndResetToEmptyProject,
} from './real-helpers'

let electronProcess: ChildProcess
let browser: Browser
let page: Page
let tmpDir: string

test.describe('File Explorer — real click to open', () => {
  test.beforeAll(async () => {
    test.setTimeout(90_000)

    // Create a temp directory with test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conductor-e2e-'))
    fs.writeFileSync(path.join(tmpDir, 'hello.ts'), 'export const greeting = "hello world"\n')
    fs.writeFileSync(path.join(tmpDir, 'notes.md'), '# Notes\n\nSome content here.\n')
    fs.mkdirSync(path.join(tmpDir, 'src'))
    fs.writeFileSync(path.join(tmpDir, 'src', 'app.tsx'), 'export default function App() { return <div /> }\n')

    killAllConductorProcesses()
    await new Promise(r => setTimeout(r, 2000))

    const app = await launchElectronApp()
    electronProcess = app.electronProcess
    browser = app.browser
    page = app.page
  })

  test.afterAll(async () => {
    try { await browser?.close() } catch {}
    if (electronProcess) electronProcess.kill('SIGKILL')
    killAllConductorProcesses()

    // Clean up temp files
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  })

  test('clicking a file in the file explorer opens a tab', async () => {
    test.setTimeout(60_000)

    await waitForAppAndResetToEmptyProject(page)

    // Point sidebar at our temp directory and open file explorer
    await page.evaluate((dir) => {
      const { sidebar, activityBar } = (window as any).__stores__
      sidebar.getState().setRootPath(dir)
      activityBar.getState().setActiveExtension('file-explorer')
    }, tmpDir)

    // Wait for file tree to load and show our files
    await expect(async () => {
      const visible = await page.locator('text=hello.ts').isVisible()
      expect(visible).toBe(true)
    }).toPass({ timeout: 10_000, intervals: [500] })

    await page.screenshot({ path: 'e2e/screenshots/file-click-01-tree-loaded.png' })
    console.log('File tree loaded, files visible')

    // Dump store state before clicking
    const beforeState = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupIds = layout.getState().getAllGroupIds()
      const focusedGroupId = layout.getState().focusedGroupId
      const groups = tabs.getState().groups
      const tabCounts: Record<string, number> = {}
      for (const [gid, g] of Object.entries(groups) as any[]) {
        tabCounts[gid] = g.tabs.length
      }
      return { groupIds, focusedGroupId, tabCounts }
    })
    console.log('Before click — store state:', JSON.stringify(beforeState))

    // SINGLE CLICK on hello.ts
    const fileEntry = page.locator('text=hello.ts').first()
    await fileEntry.click()

    await page.screenshot({ path: 'e2e/screenshots/file-click-02-after-single-click.png' })

    // Check store state after click
    const afterClick = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupIds = layout.getState().getAllGroupIds()
      const focusedGroupId = layout.getState().focusedGroupId
      const groups = tabs.getState().groups
      const allTabs: any[] = []
      for (const [gid, g] of Object.entries(groups) as any[]) {
        for (const t of g.tabs) {
          allTabs.push({ groupId: gid, id: t.id, title: t.title, type: t.type, filePath: t.filePath })
        }
      }
      return { groupIds, focusedGroupId, allTabs }
    })
    console.log('After single click — store state:', JSON.stringify(afterClick))

    // Verify a tab was created for hello.ts
    const helloTab = afterClick.allTabs.find((t: any) => t.filePath?.endsWith('hello.ts'))
    if (!helloTab) {
      // Take a diagnostic screenshot and dump more info
      await page.screenshot({ path: 'e2e/screenshots/file-click-03-FAIL-no-tab.png' })

      // Try to understand why: check if click handler even fired
      const diagnostics = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        return {
          focusedGroupId: layout.getState().focusedGroupId,
          allGroupIds: layout.getState().getAllGroupIds(),
          groupsInTabStore: Object.keys(tabs.getState().groups),
          focusedGroupExists: !!tabs.getState().groups[layout.getState().focusedGroupId ?? ''],
        }
      })
      console.log('DIAGNOSTICS:', JSON.stringify(diagnostics))
    }

    expect(helloTab, 'Expected a tab for hello.ts to be created after clicking').toBeTruthy()
    expect(helloTab.title).toBe('hello.ts')

    // Now verify DOUBLE CLICK also works (on a different file)
    const mdEntry = page.locator('text=notes.md').first()
    await mdEntry.dblclick()

    await page.screenshot({ path: 'e2e/screenshots/file-click-04-after-double-click.png' })

    const afterDblClick = await page.evaluate(() => {
      const { tabs } = (window as any).__stores__
      const groups = tabs.getState().groups
      const allTabs: any[] = []
      for (const [gid, g] of Object.entries(groups) as any[]) {
        for (const t of g.tabs) {
          allTabs.push({ title: t.title, filePath: t.filePath })
        }
      }
      return allTabs
    })
    console.log('After double click — tabs:', JSON.stringify(afterDblClick))

    const mdTab = afterDblClick.find((t: any) => t.filePath?.endsWith('notes.md'))
    expect(mdTab, 'Expected a tab for notes.md to be created after double-clicking').toBeTruthy()

    await page.screenshot({ path: 'e2e/screenshots/file-click-05-pass.png' })
    console.log('PASS: Both single-click and double-click open file tabs')
  })
})
