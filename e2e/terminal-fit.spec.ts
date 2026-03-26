import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

async function launchApp() {
  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  await window.waitForFunction(() => {
    const stores = (window as any).__stores__
    return stores && stores.layout.getState().root !== null
  }, null, { timeout: 10000 })

  return { app, window }
}

test('terminal output fits within the visible area', async () => {
  const { app, window } = await launchApp()

  const scriptPath = path.resolve(__dirname, 'fixtures', 'long-line.sh')

  await window.evaluate((cwd) => {
    const stores = (window as any).__stores__
    const groups = stores.tabs.getState().groups
    const groupId = Object.keys(groups)[0]
    if (groupId) {
      stores.tabs.getState().addTab(groupId, { type: 'terminal', title: 'Test Terminal', filePath: cwd })
    }
  }, path.resolve(__dirname, '..'))

  await window.waitForTimeout(1200)
  await window.evaluate((script) => {
    const stores = (window as any).__stores__
    const groups = stores.tabs.getState().groups
    const groupId = Object.keys(groups)[0]
    const tab = groups[groupId]?.tabs?.find((t: any) => t.type === 'terminal')
    if (tab) {
      window.electronAPI.writeTerminal(tab.id, `bash ${JSON.stringify(script)}\n`)
    }
  }, scriptPath)

  await expect(async () => {
    const hasEnd = await window.evaluate(() => {
      const rows = document.querySelector('.xterm-rows')
      return rows?.textContent?.includes('END') ?? false
    })
    expect(hasEnd).toBe(true)
  }).toPass({ timeout: 10000, intervals: [250, 500, 1000] })

  const fit = await window.evaluate(() => {
    const xtermEl = document.querySelector('.xterm') as HTMLElement | null
    const rows = Array.from(xtermEl?.querySelectorAll('.xterm-rows > div') || [])
    const targetIndex = rows.findIndex(row => (row.textContent || '').includes('|01|'))
    const targetRow = targetIndex >= 0 ? rows[targetIndex] : null
    const nextRow = targetIndex >= 0 ? rows[targetIndex + 1] : null
    const screen = xtermEl?.querySelector('.xterm-screen') as HTMLElement | null

    let measuredCellWidth = 0
    for (const span of Array.from(xtermEl?.querySelectorAll('.xterm-rows span') || [])) {
      const text = span.textContent || ''
      if (!text.trim()) continue
      const rect = (span as HTMLElement).getBoundingClientRect()
      if (rect.width > 0) {
        measuredCellWidth = rect.width / text.length
        break
      }
    }

    const line1 = targetRow?.textContent || ''
    const line2 = nextRow?.textContent || ''

    return {
      targetIndex,
      line1,
      line2,
      measuredCellWidth,
      estimatedWidth: line1.length * measuredCellWidth,
      screenWidth: screen?.getBoundingClientRect().width || 0
    }
  })

  expect(fit.targetIndex).toBeGreaterThanOrEqual(0)
  expect(fit.line1.startsWith('|01|')).toBe(true)
  expect(fit.line2.includes('END')).toBe(true)
  expect(fit.measuredCellWidth).toBeGreaterThan(0)
  expect(fit.estimatedWidth).toBeLessThanOrEqual(fit.screenWidth + 1)

  await app.close()
})

test('terminal fit isolates xterm from app body spacing', async () => {
  const { app, window } = await launchApp()

  await window.evaluate((cwd) => {
    const stores = (window as any).__stores__
    const groups = stores.tabs.getState().groups
    const groupId = Object.keys(groups)[0]
    if (groupId) {
      stores.tabs.getState().addTab(groupId, { type: 'terminal', title: 'Test Terminal', filePath: cwd })
    }
  }, path.resolve(__dirname, '..'))

  await window.locator('.xterm .xterm-char-measure-element').waitFor({ state: 'attached', timeout: 10000 })

  const styles = await window.evaluate(() => {
    const terminal = document.querySelector('.xterm') as HTMLElement | null
    const host = terminal?.parentElement as HTMLElement | null
    const measure = document.querySelector('.xterm .xterm-char-measure-element') as HTMLElement | null

    if (!terminal || !host || !measure) return null

    return {
      bodyLetterSpacing: getComputedStyle(document.body).letterSpacing,
      terminalLetterSpacing: getComputedStyle(terminal).letterSpacing,
      measureLetterSpacing: getComputedStyle(measure).letterSpacing,
      hostPaddingLeft: getComputedStyle(host).paddingLeft,
      hostPaddingRight: getComputedStyle(host).paddingRight
    }
  })

  expect(styles).not.toBeNull()
  expect(styles?.bodyLetterSpacing).not.toBe(styles?.terminalLetterSpacing)
  expect(['normal', '0px']).toContain(styles?.terminalLetterSpacing)
  expect(['normal', '0px']).toContain(styles?.measureLetterSpacing)
  expect(styles?.hostPaddingLeft).toBe('0px')
  expect(styles?.hostPaddingRight).toBe('0px')

  await app.close()
})
