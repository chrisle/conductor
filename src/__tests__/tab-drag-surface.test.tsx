import { describe, expect, it } from 'vitest'

/**
 * Tests for CON-61: ensure the entire tab surface area is draggable,
 * not just the text label.
 *
 * The fix adds `-webkit-user-drag: element` to the tab div so that
 * Electron/Chromium allows drag initiation from any part of the tab
 * (padding, icon, etc.), not just text nodes.
 *
 * The close button also gets `draggable={false}` so that the parent
 * div's drag takes priority when the user grabs near the close button.
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
