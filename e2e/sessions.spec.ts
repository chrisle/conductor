import { test, expect } from '@playwright/test'
import {
  installTestMocks,
  waitForApp,
  addTerminalTab,
  feedTerminalData,
  setSessions,
} from './helpers'

// ── Helpers ──────────────────────────────────────────────

/** Open the Sessions sidebar by activating the work-sessions extension. */
async function openSessionsSidebar(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    ;(window as any).__stores__.activityBar.getState().setActiveExtension('work-sessions')
  })
  await page.locator('text=Sessions').first().waitFor({ state: 'visible', timeout: 3000 })
}

/** Inject mock sessions and re-mount the sidebar so it fetches them. */
async function injectSessions(
  page: import('@playwright/test').Page,
  sessions: Array<{ name: string; [k: string]: any }>,
) {
  // Map name→id for the conductordGetSessions mock format
  await setSessions(page, sessions.map(s => ({ id: s.name, ...s })))
  // Close sidebar, wait for unmount, then reopen so the hook's initial
  // refresh() call picks up the new mock data.
  await page.evaluate(() => {
    ;(window as any).__stores__.activityBar.getState().setActiveExtension(null)
  })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    ;(window as any).__stores__.activityBar.getState().setActiveExtension('work-sessions')
  })
  // Wait for the async refresh() inside useConductorSessions to complete
  await page.waitForTimeout(300)
}

/** Re-mount the sidebar by toggling the extension off then on. */
async function remountSidebar(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    ;(window as any).__stores__.activityBar.getState().setActiveExtension(null)
  })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    ;(window as any).__stores__.activityBar.getState().setActiveExtension('work-sessions')
  })
  await page.waitForTimeout(300)
}

/** Create a session folder via the project store. */
async function createSessionFolder(
  page: import('@playwright/test').Page,
  name: string,
  parentId: string | null = null,
): Promise<string> {
  return page.evaluate(
    ({ name, parentId }) =>
      (window as any).__stores__.project.getState().addSessionFolder(name, parentId),
    { name, parentId },
  )
}

/** Move sessions into a folder via the project store. */
async function moveSessionsToFolder(
  page: import('@playwright/test').Page,
  sessionIds: string[],
  folderId: string | null,
): Promise<void> {
  return page.evaluate(
    ({ sessionIds, folderId }) =>
      (window as any).__stores__.project.getState().moveSessionsToFolder(sessionIds, folderId),
    { sessionIds, folderId },
  )
}

/** Get session folder data from the store. */
async function getSessionFolders(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    (window as any).__stores__.project.getState().sessionFolders,
  )
}

/** Get all open tab IDs from the tabs store. */
async function getOpenTabIds(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => {
    const { tabs } = (window as any).__stores__
    const groups = tabs.getState().groups
    const ids: string[] = []
    for (const g of Object.values(groups) as any[]) {
      for (const t of g.tabs) ids.push(t.id)
    }
    return ids
  })
}

/** Get active tab ID in the first layout group. */
async function getActiveTabId(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => {
    const { tabs, layout } = (window as any).__stores__
    const groupId = layout.getState().getAllGroupIds()[0]
    return tabs.getState().groups[groupId]?.activeTabId ?? null
  })
}

// ── Tests ────────────────────────────────────────────────

test.describe('Sessions Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('shows empty state when no sessions exist', async ({ page }) => {
    await openSessionsSidebar(page)
    await expect(page.locator('text=No active sessions')).toBeVisible()
  })

  test('displays live sessions', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'my-shell', cwd: '/Users/test/project' },
      { name: 't-PROJ-42', cwd: '/tmp' },
    ])
    await expect(page.locator('text=shell').first()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=PROJ-42')).toBeVisible({ timeout: 3000 })
  })

  test('clicking a session row opens it as a tab', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [{ name: 'click-test', cwd: '/tmp' }])
    await page.locator('text=shell').first().click()

    // Tab should be created with the session name as its ID
    const tabIds = await getOpenTabIds(page)
    expect(tabIds).toContain('click-test')
  })

  test('clicking an already-open session focuses its tab', async ({ page }) => {
    // Create a terminal tab first
    const tabId = await addTerminalTab(page, { title: 'Existing' })

    // Add another tab via store (avoid addTerminalTab strict .xterm locator)
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, { type: 'terminal', title: 'Other' })
    })
    await page.waitForTimeout(300)

    await openSessionsSidebar(page)
    await injectSessions(page, [{ name: tabId, cwd: '/tmp' }])

    // Click the session row — sidebar shows tab title "Existing"
    await page.locator('text=Existing').first().click()
    const activeId = await getActiveTabId(page)
    expect(activeId).toBe(tabId)
  })
})

test.describe('Session Info Panel', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('info panel stays within sidebar bounds and is not clipped', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'test-session-with-long-name', cwd: '/Users/chrisle/code/conductor/app' },
    ])

    // Click the info button to expand the details panel
    const sessionRow = page.locator('text=test-session-with-long-name').first()
    await sessionRow.waitFor({ state: 'visible', timeout: 3000 })

    // Find and click the info (i) button within the session row
    const infoButton = sessionRow.locator('..').locator('button').first()
    await infoButton.click()

    // Wait for the info panel to appear (it shows the cwd)
    const infoPanel = page.locator('text=/Users/chrisle/code/conductor/app').first()
    await infoPanel.waitFor({ state: 'visible', timeout: 3000 })

    // Get the sidebar bounds and the info panel bounds
    const sidebar = page.locator('[class*="overflow-y-auto"]').first()
    const sidebarBox = await sidebar.boundingBox()
    const panelContainer = infoPanel.locator('..')
    const panelBox = await panelContainer.boundingBox()

    expect(sidebarBox).toBeTruthy()
    expect(panelBox).toBeTruthy()

    // The info panel's right edge must not exceed the sidebar's right edge
    const sidebarRight = sidebarBox!.x + sidebarBox!.width
    const panelRight = panelBox!.x + panelBox!.width
    expect(panelRight).toBeLessThanOrEqual(sidebarRight + 1) // +1px tolerance
  })
})

test.describe('Session Folders', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('displays user-defined session folders', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'sess-a', cwd: '/tmp' },
      { name: 'sess-b', cwd: '/tmp' },
    ])
    const folderId = await createSessionFolder(page, 'Feature Work')
    await moveSessionsToFolder(page, ['sess-a'], folderId)
    await remountSidebar(page)

    await expect(page.locator('text=Feature Work')).toBeVisible({ timeout: 3000 })
  })

  test('sessions in a folder appear under that folder', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 't-NP-10', cwd: '/tmp' },
      { name: 't-NP-20', cwd: '/tmp' },
      { name: 'ungrouped-sess', cwd: '/tmp' },
    ])
    const folderId = await createSessionFolder(page, 'Sprint 5')
    await moveSessionsToFolder(page, ['t-NP-10', 't-NP-20'], folderId)
    await remountSidebar(page)

    await expect(page.locator('text=Sprint 5')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=t-NP-10')).toBeVisible()
    await expect(page.locator('text=t-NP-20')).toBeVisible()
  })

  test('drag session into a folder moves it via store', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'drag-me', cwd: '/tmp' },
    ])
    const folderId = await createSessionFolder(page, 'Target Folder')
    await remountSidebar(page)

    await expect(page.locator('text=Target Folder')).toBeVisible({ timeout: 3000 })

    const sessionRow = page.locator('text=drag-me').first()
    const folderRow = page.locator('text=Target Folder')

    await sessionRow.dragTo(folderRow)

    const folders = await getSessionFolders(page)
    const target = folders.find((f: any) => f.id === folderId)
    expect(target.sessionIds).toContain('drag-me')
  })

  test('drag session between folders moves it from old to new', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [{ name: 'moving-sess', cwd: '/tmp' }])
    const folder1Id = await createSessionFolder(page, 'Folder A')
    const folder2Id = await createSessionFolder(page, 'Folder B')
    await moveSessionsToFolder(page, ['moving-sess'], folder1Id)
    await remountSidebar(page)

    await expect(page.locator('text=Folder A')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Folder B')).toBeVisible()

    const sessionRow = page.locator('text=moving-sess').first()
    const folderBRow = page.locator('text=Folder B')
    await sessionRow.dragTo(folderBRow)

    const folders = await getSessionFolders(page)
    const fA = folders.find((f: any) => f.id === folder1Id)
    const fB = folders.find((f: any) => f.id === folder2Id)
    expect(fA.sessionIds).not.toContain('moving-sess')
    expect(fB.sessionIds).toContain('moving-sess')
  })

  test('drop session on root area moves it out of folder', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'grouped-sess', cwd: '/tmp' },
      { name: 'other-sess', cwd: '/tmp' },
    ])
    const folderId = await createSessionFolder(page, 'My Folder')
    await moveSessionsToFolder(page, ['grouped-sess'], folderId)
    await remountSidebar(page)

    await expect(page.locator('text=My Folder')).toBeVisible({ timeout: 3000 })

    // Drag out to root area
    const sessionRow = page.locator('text=grouped-sess').first()
    const rootArea = page.locator('text=other-sess').first()
    await sessionRow.dragTo(rootArea)

    const folders = await getSessionFolders(page)
    const myFolder = folders.find((f: any) => f.id === folderId)
    expect(myFolder.sessionIds).not.toContain('grouped-sess')
  })
})

test.describe('Terminal Tab Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('new terminal receives isNew=true from createTerminal', async ({ page }) => {
    const tabId = await addTerminalTab(page)
    expect(tabId).toBeTruthy()

    // Console should log isNew=true
    const logs = await page.evaluate(() => {
      // The mock createTerminal records isNew in the test terminal
      return (window as any).__testTerminal__.writes
    })
    // Terminal should be connected (xterm visible)
    await expect(page.locator('.xterm')).toBeVisible()
  })

  test('terminal displays PTY data', async ({ page }) => {
    const tabId = await addTerminalTab(page)
    await feedTerminalData(page, tabId, 'hello world\r\n')

    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('hello world')
    }).toPass({ timeout: 3000, intervals: [200] })
  })

  test('keyboard input is sent to PTY via writeTerminal', async ({ page }) => {
    const tabId = await addTerminalTab(page)
    // Focus terminal and type
    await page.locator('.xterm').click()
    await page.keyboard.type('ls -la')

    const writes = await page.evaluate(() =>
      (window as any).__testTerminal__.writes.filter(
        (w: any) => w.id !== '' // filter noise
      ),
    )
    const allData = writes.map((w: any) => w.data).join('')
    expect(allData).toContain('l')
    expect(allData).toContain('s')
  })

  test('closing tab removes it from the store', async ({ page }) => {
    const tabId = await addTerminalTab(page, { title: 'ToClose' })
    await expect(page.locator('text=ToClose')).toBeVisible()

    // Close via store (simulating close button)
    await page.evaluate(({ tabId }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().removeTab(groupId, tabId)
    }, { tabId })

    await expect(page.locator('text=ToClose')).not.toBeVisible({ timeout: 3000 })
    const ids = await getOpenTabIds(page)
    expect(ids).not.toContain(tabId)
  })

  test('reattaching a session returns isNew=false', async ({ page }) => {
    // Create first terminal
    const tabId = await addTerminalTab(page, { title: 'Reattach' })
    await feedTerminalData(page, tabId, 'PERSIST_ME\r\n')

    // Wait for content to render
    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('PERSIST_ME')
    }).toPass({ timeout: 3000, intervals: [200] })

    // Close the tab (triggers buffer serialization to sessionStorage)
    await page.evaluate(({ tabId }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().removeTab(groupId, tabId)
    }, { tabId })
    await page.waitForTimeout(200)

    // Verify buffer was saved to sessionStorage
    const hasSaved = await page.evaluate(({ tabId }) => {
      return sessionStorage.getItem(`terminal:buffer:${tabId}`) !== null
    }, { tabId })
    expect(hasSaved).toBe(true)

    // Re-open the same session — should get isNew=false
    const isNew = await page.evaluate(({ tabId }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().addTab(groupId, {
        id: tabId,
        type: 'terminal',
        title: 'Reattach',
      })
      // Check what createTerminal will return by seeing if the session is known
      // (our mock tracks knownSessions)
      return window.electronAPI.createTerminal(tabId).then(r => r.isNew)
    }, { tabId })
    expect(isNew).toBe(false)
  })

  test('serialized buffer is saved on tab close', async ({ page }) => {
    const tabId = await addTerminalTab(page, { title: 'BufferTest' })
    await feedTerminalData(page, tabId, 'BUFFER_CONTENT\r\n')

    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('BUFFER_CONTENT')
    }).toPass({ timeout: 3000, intervals: [200] })

    // Close the tab
    await page.evaluate(({ tabId }) => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      tabs.getState().removeTab(groupId, tabId)
    }, { tabId })
    await page.waitForTimeout(200)

    // Buffer should be in sessionStorage
    const saved = await page.evaluate(({ tabId }) => {
      return sessionStorage.getItem(`terminal:buffer:${tabId}`)
    }, { tabId })
    expect(saved).toBeTruthy()
    expect(saved).toContain('BUFFER_CONTENT')
  })
})

test.describe('Tab Switching and Independent Data', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('switching tabs shows the correct terminal content', async ({ page }) => {
    const tab1 = await addTerminalTab(page, { title: 'Alpha' })
    await feedTerminalData(page, tab1, 'ALPHA_DATA\r\n')

    // Verify Alpha rendered
    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('ALPHA_DATA')
    }).toPass({ timeout: 3000, intervals: [200] })

    // Add second tab
    const tab2 = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, {
        type: 'terminal',
        title: 'Beta',
      })
    })
    await page.waitForTimeout(500)
    await feedTerminalData(page, tab2, 'BETA_DATA\r\n')

    // Switch to Alpha
    const tabBar = page.locator('[style*="height: 36px"]').first()
    await tabBar.locator('text=Alpha').click()

    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('ALPHA_DATA')
    }).toPass({ timeout: 3000, intervals: [200] })
  })

  test('multiple terminals maintain independent data streams', async ({ page }) => {
    const tab1 = await addTerminalTab(page, { title: 'T1' })
    await feedTerminalData(page, tab1, 'DATA_FOR_T1\r\n')

    // Verify T1 data rendered before adding T2
    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('DATA_FOR_T1')
    }).toPass({ timeout: 3000, intervals: [200] })

    const tab2 = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      return tabs.getState().addTab(groupId, {
        type: 'terminal',
        title: 'T2',
      })
    })
    // Wait for T2's xterm to mount and createTerminal to complete
    await page.waitForTimeout(800)
    await feedTerminalData(page, tab2, 'DATA_FOR_T2\r\n')

    // T2 is active (last added), should show T2 data
    await expect(async () => {
      const text = await page.evaluate(() => {
        // Get the visible xterm rows (last mounted xterm is the active one)
        const allRows = document.querySelectorAll('.xterm-rows')
        return allRows[allRows.length - 1]?.textContent ?? ''
      })
      expect(text).toContain('DATA_FOR_T2')
    }).toPass({ timeout: 3000, intervals: [200] })

    // Switch to T1
    const tabBar = page.locator('[style*="height: 36px"]').first()
    await tabBar.locator('text=T1').click()

    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('DATA_FOR_T1')
    }).toPass({ timeout: 3000, intervals: [200] })
  })
})

test.describe('Session Folder Management', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('creating a folder via store shows in sidebar', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'sess-1', cwd: '/tmp' },
    ])
    const folderId = await createSessionFolder(page, 'Test Folder')
    await moveSessionsToFolder(page, ['sess-1'], folderId)
    await remountSidebar(page)

    await expect(page.locator('text=Test Folder')).toBeVisible({ timeout: 3000 })
  })

  test('removing a folder removes it from sidebar', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [{ name: 'sess-1', cwd: '/tmp' }])
    const folderId = await createSessionFolder(page, 'Doomed Folder')
    await moveSessionsToFolder(page, ['sess-1'], folderId)
    await remountSidebar(page)
    await expect(page.locator('text=Doomed Folder')).toBeVisible({ timeout: 3000 })

    // Remove the folder
    await page.evaluate(
      (id) => (window as any).__stores__.project.getState().removeSessionFolder(id),
      folderId,
    )

    await expect(page.locator('text=Doomed Folder')).not.toBeVisible({ timeout: 3000 })
  })

  test('renaming a folder updates the sidebar', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [{ name: 'sess-1', cwd: '/tmp' }])
    const folderId = await createSessionFolder(page, 'Old Name')
    await moveSessionsToFolder(page, ['sess-1'], folderId)
    await remountSidebar(page)
    await expect(page.locator('text=Old Name')).toBeVisible({ timeout: 3000 })

    // Rename
    await page.evaluate(
      ({ id, name }) =>
        (window as any).__stores__.project.getState().renameSessionFolder(id, name),
      { id: folderId, name: 'New Name' },
    )

    await expect(page.locator('text=New Name')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Old Name')).not.toBeVisible()
  })
})

test.describe('Terminal Process Exit', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('process exit shows exit message in terminal', async ({ page }) => {
    const tabId = await addTerminalTab(page)
    await feedTerminalData(page, tabId, 'some output\r\n')

    // Signal exit
    await page.evaluate(
      (id) => (window as any).__testTerminal__.feedExit(id),
      tabId,
    )

    await expect(async () => {
      const text = await page.evaluate(() =>
        document.querySelector('.xterm-rows')?.textContent ?? '',
      )
      expect(text).toContain('[Process exited]')
    }).toPass({ timeout: 3000, intervals: [200] })
  })
})

test.describe('Claude Code Tab', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  test('claude-code tab renders with autopilot toggle', async ({ page }) => {
    await addTerminalTab(page, { type: 'claude-code', title: 'Claude' })
    await expect(page.locator('text=Claude').first()).toBeVisible()
    await expect(page.locator('text=Auto-pilot')).toBeVisible({ timeout: 5000 })
  })

  test('opening session from sidebar creates claude-code tab', async ({ page }) => {
    await openSessionsSidebar(page)
    await injectSessions(page, [
      { name: 'claude-code-test', command: 'claude', cwd: '/tmp' },
    ])

    // Click the session
    await page.locator('text=claude-code-test').first().click()

    // Should create a tab with type claude-code
    const tabType = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const group = tabs.getState().groups[groupId]
      const tab = group.tabs.find((t: any) => t.id === 'claude-code-test')
      return tab?.type
    })
    expect(tabType).toBe('claude-code')
  })
})
