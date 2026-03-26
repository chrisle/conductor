import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

test('terminal tab can execute a command', async () => {
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

  const tabId = await window.evaluate(() => {
    const { tabs, layout } = (window as any).__stores__
    const groupId = layout.getState().getAllGroupIds()[0]
    return tabs.getState().addTab(groupId, {
      type: 'terminal',
      title: 'Terminal'
    })
  })

  await window.waitForTimeout(1200)
  await window.evaluate((id) => {
    window.electronAPI.writeTerminal(id, 'printf READY\\n\r')
  }, tabId)

  await expect(async () => {
    const hasReady = await window.evaluate(() => {
      const rows = document.querySelector('.xterm-rows')
      return rows?.textContent?.includes('READY') ?? false
    })
    expect(hasReady).toBe(true)
  }).toPass({ timeout: 10000, intervals: [250, 500, 1000] })

  await app.close()
})
