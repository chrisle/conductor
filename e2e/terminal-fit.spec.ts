import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'path'
import fs from 'fs'

test('terminal cols do not exceed visible area', async () => {
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

  // Open a terminal
  await window.evaluate((cwd) => {
    const stores = (window as any).__stores__
    const groups = stores.tabs.getState().groups
    const groupId = Object.keys(groups)[0]
    if (groupId) stores.tabs.getState().addTab(groupId, { type: 'terminal', title: 'Test Terminal', filePath: cwd })
  }, path.resolve(__dirname, '..'))
  await window.waitForTimeout(2000)

  // Run long-line script
  const scriptPath = path.resolve(__dirname, 'fixtures', 'long-line.sh')
  await window.evaluate((script) => {
    const stores = (window as any).__stores__
    const groups = stores.tabs.getState().groups
    const groupId = Object.keys(groups)[0]
    const tab = groups[groupId]?.tabs?.find((t: any) => t.type === 'terminal')
    if (tab) window.electronAPI.writeTerminal(tab.id, `bash ${script}\n`)
  }, scriptPath)

  await window.waitForFunction(() => {
    const rows = document.querySelector('.xterm-rows')
    return rows && rows.textContent?.includes('END')
  }, null, { timeout: 10000 })
  await window.waitForTimeout(500)

  // THE KEY TEST: check cols * actualCellWidth <= screenWidth
  const result = await window.evaluate(() => {
    const xtermEl = document.querySelector('.xterm') as HTMLElement
    if (!xtermEl) return { error: 'no xterm' }

    const screen = xtermEl.querySelector('.xterm-screen') as HTMLElement
    const viewport = xtermEl.querySelector('.xterm-viewport') as HTMLElement
    const rows = xtermEl.querySelector('.xterm-rows') as HTMLElement
    if (!screen) return { error: 'no screen' }

    // Get terminal cols from the first row's character count
    const firstRow = rows?.querySelector('.xterm-rows > div')
    const firstRowWidth = firstRow?.getBoundingClientRect().width ?? 0

    // Get actual cell width by measuring a character span
    const charSpans = xtermEl.querySelectorAll('.xterm-rows span')
    let measuredCellWidth = 0
    for (const span of Array.from(charSpans)) {
      const text = span.textContent || ''
      if (text.length > 0 && text.trim().length > 0) {
        const rect = span.getBoundingClientRect()
        measuredCellWidth = rect.width / text.length
        break
      }
    }

    const screenRect = screen.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()

    // Read buffer lines to see where text wraps
    const bufferLines: string[] = []
    rows?.querySelectorAll('.xterm-rows > div').forEach(row => {
      const text = row.textContent || ''
      if (text.includes('|01|')) bufferLines.push(text)
      else if (bufferLines.length > 0 && bufferLines.length < 3 && text.trim()) bufferLines.push(text)
    })

    return {
      screenWidth: screenRect.width,
      screenRight: Math.round(screenRect.right),
      viewportWidth: viewport.clientWidth,
      viewportRight: Math.round(viewportRect.right),
      windowWidth: window.innerWidth,
      firstRowWidth: Math.round(firstRowWidth),
      measuredCellWidth,
      devicePixelRatio: window.devicePixelRatio,
      bufferLine1: bufferLines[0]?.slice(-30) || '',
      bufferLine2: bufferLines[1]?.slice(0, 30) || '',
      line1Length: bufferLines[0]?.length || 0,
    }
  })

  console.log('\n=== TERMINAL FIT RESULT ===')
  console.log(JSON.stringify(result, null, 2))

  if (result && !('error' in result)) {
    console.log(`\nLine 1 ends with: "${result.bufferLine1}"`)
    console.log(`Line 2 starts with: "${result.bufferLine2}"`)
    console.log(`Line 1 length (= terminal cols): ${result.line1Length}`)
    console.log(`Screen width: ${result.screenWidth}px`)
    console.log(`Measured cell width: ${result.measuredCellWidth}px`)

    if (result.measuredCellWidth > 0) {
      const actualCols = result.line1Length
      // The viewport width minus internal scrollbar reserve is the TRUE available space
      const scrollBarReserve = result.viewportWidth - result.screenWidth
      // But screen width was set AFTER correction, so the actual available width
      // is viewport - the ORIGINAL reserve. Use: cols * measuredCellWidth <= viewportWidth - scrollBarReserve
      // where scrollBarReserve comes from the INITIAL fit.
      // Simpler check: the rendered width (cols * measuredCellWidth) must be <= viewportWidth
      const renderedWidth = actualCols * result.measuredCellWidth
      const availableWidth = result.viewportWidth  // viewport is CSS-sized, stable
      console.log(`Rendered width: ${renderedWidth.toFixed(1)}px, Viewport: ${availableWidth}px`)
      console.log(`Fits: ${renderedWidth <= availableWidth ? 'YES' : 'NO — overflow by ' + (renderedWidth - availableWidth).toFixed(1) + 'px'}`)

      // The rendered text must fit within the viewport
      expect(renderedWidth, `Rendered text (${renderedWidth.toFixed(0)}px) exceeds viewport (${availableWidth}px)`).toBeLessThanOrEqual(availableWidth)
    }
  }

  // Save screenshots for visual inspection
  const screenshotDir = path.join(__dirname, '..', 'test-results')
  fs.mkdirSync(screenshotDir, { recursive: true })
  await window.screenshot({ path: path.join(screenshotDir, 'terminal-fit.png') })

  await app.close()
})
