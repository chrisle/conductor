import { test, expect } from '@playwright/test'
import { installTestMocks, waitForApp } from './helpers'

const MOCK_FILES = [
  { name: 'README.md', path: '/tmp/README.md', isDirectory: false, isFile: true },
  { name: 'index.ts', path: '/tmp/index.ts', isDirectory: false, isFile: true },
  { name: 'src', path: '/tmp/src', isDirectory: true, isFile: false },
]

/**
 * Install mocks with a readDir that returns test files for /tmp
 * and empty arrays for subdirectories.
 */
async function installMocksWithFiles(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const dataListeners = new Set<Function>()
    const exitListeners = new Set<Function>()
    const writes: Array<{ id: string; data: string }> = []
    const creates: Array<{ id: string; cwd?: string; command?: string }> = []
    const knownSessions = new Set<string>()
    let mockSessions: any[] = []

    const testTerminal = {
      feedData(id: string, data: string) {
        for (const cb of dataListeners) cb(null, id, data)
      },
      feedExit(id: string) {
        for (const cb of exitListeners) cb(null, id)
      },
      writes,
      creates,
      setSessions(sessions: any[]) { mockSessions = sessions },
    }
    ;(window as any).__testTerminal__ = testTerminal

    const noop = async () => {}

    const mockFiles: Record<string, any[]> = {
      '/tmp': [
        { name: 'README.md', path: '/tmp/README.md', isDirectory: false, isFile: true },
        { name: 'index.ts', path: '/tmp/index.ts', isDirectory: false, isFile: true },
        { name: 'src', path: '/tmp/src', isDirectory: true, isFile: false },
      ],
      '/tmp/src': [
        { name: 'app.tsx', path: '/tmp/src/app.tsx', isDirectory: false, isFile: true },
      ],
    }

    ;(window as any).electronAPI = {
      minimize: noop,
      maximize: noop,
      close: noop,
      forceClose: noop,
      isMaximized: async () => false,
      onCloseRequested: () => {},
      offCloseRequested: () => {},

      readDir: async (dir: string) => mockFiles[dir] ?? [],
      readFile: async (path: string) => ({
        success: true,
        content: `// contents of ${path}`,
      }),
      readFileBinary: async () => ({ success: false, error: 'test' }),
      writeFile: async () => ({ success: true }),
      rename: async () => ({ success: true }),
      deleteFile: async () => ({ success: true }),
      mkdir: async () => ({ success: true }),
      getHomeDir: async () => '/tmp',
      autocomplete: async () => [],
      loadFavorites: async () => [],
      saveFavorites: noop,
      gitBranch: async () => null,
      gitLog: async () => [],

      loadConfig: async () => null,
      saveConfig: noop,
      patchConfig: async (patch: any) => patch,
      loadCache: async () => null,
      saveCache: noop,
      invalidateCache: noop,

      createTerminal: async (id: string, cwd?: string, command?: string) => {
        const isNew = !knownSessions.has(id)
        knownSessions.add(id)
        creates.push({ id, cwd, command })
        setTimeout(() => testTerminal.feedData(id, '$ '), 50)
        return { isNew }
      },
      writeTerminal: async (id: string, data: string) => { writes.push({ id, data }) },
      resizeTerminal: noop,
      killTerminal: noop,
      setAutoPilot: noop,
      onTerminalData: (cb: Function) => { dataListeners.add(cb) },
      offTerminalData: (cb: Function) => { dataListeners.delete(cb) },
      onTerminalExit: (cb: Function) => { exitListeners.add(cb) },
      offTerminalExit: (cb: Function) => { exitListeners.delete(cb) },

      worktreeList: async () => [],
      worktreeAdd: async () => ({ success: false, error: 'test' }),

      getCwd: async () => '/tmp',
      listClaudeSessions: async () => [],
      getTicketBinding: async () => null,
      setTicketBinding: noop,
      getAllTicketBindings: async () => ({}),
      removeTicketBinding: noop,
      createWorkSession: async (s: any) => s,
      updateWorkSession: async () => null,
      getWorkSession: async () => null,
      getWorkSessionsByTicket: async () => [],
      getAllWorkSessions: async () => [],
      deleteWorkSession: noop,

      selectDirectory: async () => null,
      saveProjectDialog: async () => null,
      openProjectDialog: async () => null,
      loadRecentProjects: async () => [],
      saveRecentProjects: noop,

      generateTicket: async () => ({ success: false, error: 'test' }),

      jiraFetch: async () => ({ ok: false, status: 0, body: null, error: 'test' }),
      jiraPost: async () => ({ ok: false, status: 0, body: null, error: 'test' }),

      getExtensionsDir: async () => '/tmp/extensions',
      listExtensions: async () => [],
      installExtension: async () => ({ success: false, error: 'test' }),
      uninstallExtension: async () => ({ success: false, error: 'test' }),
      selectExtensionZip: async () => null,

      watchConductordLogs: async () => 'mock',
      unwatchConductordLogs: noop,
      onConductordLogs: () => {},
      offConductordLogs: () => {},
      conductordHealth: async () => true,
      conductordGetSessions: async () => mockSessions,

      isConductordInstalled: async () => true,
      installConductord: async () => ({ success: true }),
      uninstallConductord: async () => ({ success: true }),
      startConductord: async () => ({ success: true }),
      stopConductord: async () => ({ success: true }),
      restartConductord: async () => ({ success: true }),
      hasFullDiskAccess: async () => true,
      openFullDiskAccessSettings: noop,

      platform: 'darwin',
    }
  })
}

/** Open the file explorer sidebar by clicking the activity bar icon */
async function openFileExplorer(page: import('@playwright/test').Page) {
  // The file-explorer extension uses FolderOpen icon — click it in the activity bar
  await page.evaluate(() => {
    const { activityBar } = (window as any).__stores__
    activityBar.getState().setActiveExtension('file-explorer')
  })
  // Wait for the file tree to render with our mock files
  await page.waitForFunction(() => {
    return document.querySelectorAll('[class*="cursor-pointer"][class*="select-none"]').length > 0
  }, null, { timeout: 5000 })
}

test.describe('File Explorer — click to open', () => {
  test.beforeEach(async ({ page }) => {
    await installMocksWithFiles(page)
    await waitForApp(page)
    await openFileExplorer(page)
  })

  test('file tree renders mock files', async ({ page }) => {
    await expect(page.locator('text=README.md')).toBeVisible()
    await expect(page.locator('text=index.ts')).toBeVisible()
    await expect(page.locator('text=src')).toBeVisible()
  })

  test('clicking a file opens a tab', async ({ page }) => {
    // Click on index.ts in the file tree
    await page.locator('text=index.ts').click()

    // A tab titled "index.ts" should appear
    await expect(async () => {
      const tabCount = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        const groupId = layout.getState().getAllGroupIds()[0]
        const group = tabs.getState().groups[groupId]
        return group?.tabs.length ?? 0
      })
      expect(tabCount).toBeGreaterThan(0)
    }).toPass({ timeout: 3000 })

    // Verify the tab has the right title and filePath
    const tabInfo = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const groupId = layout.getState().getAllGroupIds()[0]
      const group = tabs.getState().groups[groupId]
      const tab = group?.tabs.find((t: any) => t.filePath === '/tmp/index.ts')
      return tab ? { title: tab.title, filePath: tab.filePath, type: tab.type } : null
    })
    expect(tabInfo).not.toBeNull()
    expect(tabInfo!.title).toBe('index.ts')
    expect(tabInfo!.filePath).toBe('/tmp/index.ts')
  })

  test('clicking the same file twice does not open duplicate tabs', async ({ page }) => {
    // Use first() to target the file tree entry, not the tab title that appears after
    await page.locator('text=index.ts').first().click()

    // Wait for tab to appear
    await expect(async () => {
      const count = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        const gid = layout.getState().getAllGroupIds()[0]
        return tabs.getState().groups[gid]?.tabs.length ?? 0
      })
      expect(count).toBe(1)
    }).toPass({ timeout: 3000 })

    // Click again — now there are two "index.ts" elements (file tree + tab), target the file tree one
    await page.locator('text=index.ts').first().click()
    await page.waitForTimeout(500)

    // Should still be 1 tab
    const count = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const gid = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[gid]?.tabs.length ?? 0
    })
    expect(count).toBe(1)
  })

  test('clicking a directory expands it instead of opening a tab', async ({ page }) => {
    // Click "src" folder
    await page.locator('text=src').click()

    // Should expand and show children
    await expect(page.locator('text=app.tsx')).toBeVisible({ timeout: 3000 })

    // No tab should have been opened
    const tabCount = await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const gid = layout.getState().getAllGroupIds()[0]
      return tabs.getState().groups[gid]?.tabs.length ?? 0
    })
    expect(tabCount).toBe(0)
  })

  test('clicking a file inside expanded directory opens it', async ({ page }) => {
    // Expand src
    await page.locator('text=src').click()
    await expect(page.locator('text=app.tsx')).toBeVisible({ timeout: 3000 })

    // Click app.tsx
    await page.locator('text=app.tsx').click()

    await expect(async () => {
      const tab = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        const gid = layout.getState().getAllGroupIds()[0]
        const group = tabs.getState().groups[gid]
        return group?.tabs.find((t: any) => t.filePath === '/tmp/src/app.tsx') ?? null
      })
      expect(tab).not.toBeNull()
    }).toPass({ timeout: 3000 })
  })

  test('clicking a file with stale focusedGroupId still works', async ({ page }) => {
    // Simulate a stale focusedGroupId by setting it to a non-existent group
    await page.evaluate(() => {
      const { layout } = (window as any).__stores__
      layout.getState().setFocusedGroup('non-existent-group-id')
    })

    // Click on a file
    await page.locator('text=README.md').click()

    // Tab must land in a group that is in the layout (visible), not a ghost group
    await expect(async () => {
      const result = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        const layoutGroupIds = layout.getState().getAllGroupIds()
        for (const gid of layoutGroupIds) {
          const group = tabs.getState().groups[gid]
          if (group?.tabs.some((t: any) => t.filePath === '/tmp/README.md')) return true
        }
        return false
      })
      expect(result).toBe(true)
    }).toPass({ timeout: 3000 })
  })

  test('clicking a file with focusedGroupId pointing to a ghost group in tabs store opens in visible group', async ({ page }) => {
    // Create a ghost group: exists in tabs store but NOT in layout
    await page.evaluate(() => {
      const { tabs, layout } = (window as any).__stores__
      const ghostId = tabs.getState().createGroup()
      // Point focusedGroupId at the ghost group
      layout.getState().setFocusedGroup(ghostId)
    })

    await page.locator('text=index.ts').click()

    // Tab must be in a layout-visible group, not the ghost group
    await expect(async () => {
      const result = await page.evaluate(() => {
        const { tabs, layout } = (window as any).__stores__
        const layoutGroupIds = layout.getState().getAllGroupIds()
        for (const gid of layoutGroupIds) {
          const group = tabs.getState().groups[gid]
          if (group?.tabs.some((t: any) => t.filePath === '/tmp/index.ts')) return true
        }
        return false
      })
      expect(result).toBe(true)
    }).toPass({ timeout: 3000 })
  })
})
