import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'

const MOCK_SCRIPT = path.resolve(__dirname, 'fixtures', 'mock-claude-menu.js')

test('autopilot accepts Claude Code interactive menu by pressing Enter', async () => {
  const app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: { ...process.env, NODE_ENV: 'test' }
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Wait for the app to initialise (layout creates the first empty group)
  await window.waitForFunction(() => {
    const stores = (window as any).__stores__
    return stores && stores.layout.getState().root !== null
  }, null, { timeout: 10000 })

  // Add a Claude tab whose initial command runs our mock script instead of real claude
  const mockCmd = `node ${JSON.stringify(MOCK_SCRIPT)}\n`
  await window.evaluate((cmd) => {
    const { tabs, layout } = (window as any).__stores__
    const groupIds = layout.getState().getAllGroupIds()
    const groupId = groupIds[0]
    tabs.getState().addTab(groupId, {
      type: 'claude',
      title: 'Claude Test',
      initialCommand: cmd
    })
  }, mockCmd)

  // Enable autopilot by clicking the switch — must happen before the mock
  // prints its menu (~500 ms from now, plenty of time)
  const autopilotSwitch = window.locator('#autopilot')
  await autopilotSwitch.waitFor({ state: 'visible', timeout: 5000 })
  await autopilotSwitch.click()

  // The mock script prints the menu after 500 ms, autopilot matches the
  // "Do you want to …?" + "1. Yes" pattern and sends Enter, then the
  // mock prints "PASS".
  //
  // xterm renders into a canvas, so we can't use text selectors.
  // Instead, poll the terminal buffer via the xterm accessibility tree
  // or by reading buffer rows from the store.
  //
  // Fallback: read the raw DOM text content of the terminal container.
  await expect(async () => {
    const found = await window.evaluate(() => {
      // xterm's accessibility layer writes row content into
      // .xterm-accessibility-tree > div elements.  Fall back to
      // reading textContent of the whole terminal container.
      const accessTree = document.querySelector('.xterm-accessibility-tree')
      if (accessTree) {
        return accessTree.textContent?.includes('PASS') ?? false
      }
      // fallback: any element with "PASS"
      return document.body.innerText.includes('PASS')
    })
    expect(found).toBe(true)
  }).toPass({ timeout: 15000, intervals: [500] })

  // Verify it did NOT print FAIL
  const hasFail = await window.evaluate(() => {
    const accessTree = document.querySelector('.xterm-accessibility-tree')
    const text = accessTree?.textContent ?? document.body.innerText
    return text.includes('FAIL')
  })
  expect(hasFail).toBe(false)

  await app.close()
})
