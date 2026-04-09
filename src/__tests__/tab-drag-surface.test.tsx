import { describe, expect, it } from 'vitest'

/**
 * Tests for CON-61: ensure the entire tab surface area is draggable,
 * not just the text label.
 *
 * Three-part fix:
 * 1. The tab div has `-webkit-user-drag: element` (inline style) so Electron/
 *    Chromium treats the whole element as the drag surface.
 * 2. index.css sets `pointer-events: none` on SVGs inside any
 *    `[draggable="true"]` element. This prevents SVG icons from intercepting
 *    mousedown and ensures it always reaches the parent draggable div.
 * 3. The close button has `draggable={false}` so it is never treated as a drag
 *    source even if the CSS rule were removed.
 */
describe('tab drag surface area (CON-61)', () => {
  it('tab div has WebkitUserDrag style to enable full-surface drag', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/Layout/TabGroup.tsx'),
      'utf-8',
    )

    // The draggable tab div must include -webkit-user-drag: element
    // to work across the full surface in Electron/Chromium
    expect(source).toContain("WebkitUserDrag: 'element'")
  })

  it('index.css makes SVGs inside draggable containers pointer-transparent', () => {
    const fs = require('fs')
    const path = require('path')
    const css = fs.readFileSync(
      path.resolve(__dirname, '../index.css'),
      'utf-8',
    )

    // SVG icons (lucide-react) must not intercept mousedown — pointer-events: none
    // ensures the event reaches the parent [draggable] div reliably
    expect(css).toContain('[draggable="true"] svg')
    expect(css).toContain('pointer-events: none')
  })

  it('close button has draggable={false} to avoid blocking parent drag', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/Layout/TabGroup.tsx'),
      'utf-8',
    )

    // The close button inside each tab must not capture drag events
    expect(source).toContain('draggable={false}')
  })
})
