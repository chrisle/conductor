/**
 * E2E tests for the kanban-extension extension install (Load Unpacked) and uninstall workflow.
 *
 * Success criteria:
 *  - Extension loads from the local kanban-extension directory via "Load Unpacked"
 *  - It appears in the Dev (Unpacked) section of the Extensions settings panel
 *  - A 4th toolbar icon (Jira / SquareKanban) appears in the activity bar
 *  - Unloading removes it from the list and from the activity bar
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { installTestMocks, waitForApp } from './helpers'

const JIRA_EXT_DIR = join(__dirname, '../../kanban-extension')

/** Read the kanban-extension files from disk and inject readFile mocks, then call loadExtension. */
async function loadJiraExtension(page: any) {
  const manifest = readFileSync(join(JIRA_EXT_DIR, 'manifest.json'), 'utf-8')
  const bundle = readFileSync(join(JIRA_EXT_DIR, 'dist/index.js'), 'utf-8')

  await page.evaluate(
    ({ dir, manifest, bundle }: { dir: string; manifest: string; bundle: string }) => {
      const orig = window.electronAPI.readFile.bind(window.electronAPI)
      window.electronAPI.readFile = async (path: string) => {
        if (path === `${dir}/manifest.json`) return { success: true, content: manifest }
        // Loader tries "${dir}/index.js" first, then "${dir}/dist/index.js"
        if (path === `${dir}/index.js` || path === `${dir}/dist/index.js`) {
          return { success: true, content: bundle }
        }
        return orig(path)
      }
    },
    { dir: JIRA_EXT_DIR, manifest, bundle },
  )

  await page.evaluate(
    (dir: string) => (window as any).__stores__.loadExtension(dir),
    JIRA_EXT_DIR,
  )

  await page.waitForFunction(
    () => (window as any).__stores__.extensionRegistry.getExtension('kanban'),
    null,
    { timeout: 5000 },
  )
}

/** Configure all mocks needed for the "Load Unpacked" UI button flow. */
async function setupLoadUnpackedMocks(page: any) {
  const manifest = readFileSync(join(JIRA_EXT_DIR, 'manifest.json'), 'utf-8')
  const bundle = readFileSync(join(JIRA_EXT_DIR, 'dist/index.js'), 'utf-8')
  const dir = JIRA_EXT_DIR

  await page.evaluate(
    ({ dir, manifest, bundle }: { dir: string; manifest: string; bundle: string }) => {
      window.electronAPI.selectExtensionDir = async () => dir
      window.electronAPI.installUnpackedExtension = async () => ({
        success: true,
        extensionId: 'kanban',
        dirPath: dir,
      })
      const orig = window.electronAPI.readFile.bind(window.electronAPI)
      window.electronAPI.readFile = async (path: string) => {
        if (path === `${dir}/manifest.json`) return { success: true, content: manifest }
        if (path === `${dir}/index.js` || path === `${dir}/dist/index.js`) {
          return { success: true, content: bundle }
        }
        return orig(path)
      }
    },
    { dir, manifest, bundle },
  )
}

/** Open Settings dialog to the Extensions section. */
async function openExtensionsSettings(page: any) {
  await page.evaluate(() =>
    (window as any).__stores__.settingsDialog.getState().openToSection('extensions'),
  )
  await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 })
  await expect(page.locator('text=Extensions').first()).toBeVisible({ timeout: 3000 })
}

test.describe('kanban-extension Extension – Install & Uninstall', () => {
  test.beforeEach(async ({ page }) => {
    await installTestMocks(page)
    await waitForApp(page)
  })

  // ── Install ────────────────────────────────────────────────────────────────

  test('load unpacked: registers in registry with correct metadata', async ({ page }) => {
    await loadJiraExtension(page)

    const ext = await page.evaluate(() => {
      const e = (window as any).__stores__.extensionRegistry.getExtension('kanban')
      return e ? { id: e.id, name: e.name, version: e.version } : null
    })

    expect(ext).not.toBeNull()
    expect(ext!.id).toBe('kanban')
    expect(ext!.name).toBe('Jira')
    expect(ext!.version).toBe('1.0.0') // version from bundle src/index.ts
  })

  test('load unpacked: adds a 4th toolbar icon to the activity bar', async ({ page }) => {
    const countBefore = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countBefore).toBe(3) // sessions, explorer, notifications

    await loadJiraExtension(page)

    const countAfter = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countAfter).toBe(4)

    const sidebarIds = await page.evaluate(() =>
      (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .map((e: any) => e.id),
    )
    expect(sidebarIds).toContain('kanban')
  })

  test('load unpacked: jira sidebar renders when icon toggled', async ({ page }) => {
    await loadJiraExtension(page)

    await page.evaluate(() =>
      (window as any).__stores__.activityBar.getState().toggleExtension('kanban'),
    )

    // JiraSidebar uses <SidebarLayout title="Jira"> — CSS uppercases it visually
    // but the DOM text content is still "Jira"
    await expect(page.locator('text=Jira').first()).toBeVisible({ timeout: 5000 })
  })

  test('load unpacked: appears in Dev (Unpacked) list in Extensions settings', async ({ page }) => {
    await setupLoadUnpackedMocks(page)
    await openExtensionsSettings(page)

    // Click "Load Unpacked" button inside Extensions settings section
    await page.getByRole('button', { name: 'Load Unpacked' }).click()

    // Wait for the extension to register
    await page.waitForFunction(
      () => (window as any).__stores__.extensionRegistry.getExtension('kanban'),
      null,
      { timeout: 5000 },
    )

    // The "kanban-extension" folder name should appear in the Dev (Unpacked) section
    await expect(page.locator('text=kanban-extension').first()).toBeVisible({ timeout: 3000 })
  })

  // ── Uninstall ──────────────────────────────────────────────────────────────

  test('unload: removes extension from registry and reduces toolbar to 3 icons', async ({ page }) => {
    await loadJiraExtension(page)

    const countBefore = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countBefore).toBe(4)

    // Unregister (simulating handleUnloadDev)
    await page.evaluate(() => {
      const stores = (window as any).__stores__
      const ab = stores.activityBar.getState()
      if (ab.activeExtensionId === 'kanban') ab.toggleExtension('kanban')
      stores.extensionRegistry.unregister('kanban')
    })

    const ext = await page.evaluate(() =>
      (window as any).__stores__.extensionRegistry.getExtension('kanban'),
    )
    expect(ext).toBeUndefined()

    const countAfter = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countAfter).toBe(3)
  })

  test('unload: full UI flow via X button in Extensions settings', async ({ page }) => {
    await setupLoadUnpackedMocks(page)
    await openExtensionsSettings(page)

    // Click Load Unpacked
    await page.getByRole('button', { name: 'Load Unpacked' }).click()

    // Wait for registration and "kanban-extension" to appear in the list
    await page.waitForFunction(
      () => (window as any).__stores__.extensionRegistry.getExtension('kanban'),
      null,
      { timeout: 5000 },
    )
    await expect(page.locator('text=kanban-extension').first()).toBeVisible({ timeout: 3000 })

    // Verify 4th icon is present
    const countAfterInstall = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countAfterInstall).toBe(4)

    // Hover the kanban-extension row to reveal the Unload button and click it
    const row = page.locator('text=kanban-extension').first().locator('../..')
    await row.hover()
    await page.getByRole('button', { name: 'Unload' }).click()

    // Extension should be gone from registry
    await page.waitForFunction(
      () => !(window as any).__stores__.extensionRegistry.getExtension('kanban'),
      null,
      { timeout: 3000 },
    )

    // Back to 3 main icons
    const countAfterUnload = await page.evaluate(() => {
      const bottomIds = new Set(['extensions', 'conductord', 'settings'])
      return (window as any).__stores__.extensionRegistry
        .getSidebarExtensions()
        .filter((e: any) => !bottomIds.has(e.id)).length
    })
    expect(countAfterUnload).toBe(3)

    // kanban-extension entry should be gone from the list
    await expect(page.locator('text=kanban-extension')).toHaveCount(0)
  })
})
