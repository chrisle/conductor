import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

test('app launches and window renders', async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Wait for the app to fully initialise — the layout store creates a root node
  await window.waitForFunction(() => {
    const stores = (window as any).__stores__
    return stores && stores.layout.getState().root !== null
  }, null, { timeout: 10000 })

  const { width, height } = await window.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  expect(width).toBeGreaterThan(400)
  expect(height).toBeGreaterThan(300)

  await app.close()
})
