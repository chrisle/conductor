import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Tests for the TabGroup `isDraggingTab` overlay reset.
 *
 * Bug: during a tab drag, TabGroup renders a full-group overlay to catch
 * drag-over/drop events on the pane content. The overlay is only hidden when
 * `dragend` fires. However, when a tab drop lands over an Electron <webview>
 * element, the <webview>'s separate renderer process captures the events and
 * neither `drop` nor `dragend` ever fires in our renderer. The overlay gets
 * wedged on, making the tab content uninteractable (no clicks, no scroll, no
 * typing).
 *
 * Fix: listen for dragend, drop, and window blur; also add a 3-second safety
 * timeout as an absolute backstop.
 */

describe('TabGroup isDraggingTab reset (source-level checks)', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../components/Layout/TabGroup.tsx'),
    'utf-8',
  )

  it('listens for dragend, drop, and blur on the window', () => {
    expect(source).toContain("addEventListener('dragend'")
    expect(source).toContain("addEventListener('drop'")
    expect(source).toContain("addEventListener('blur'")
  })

  it('has a setTimeout safety backstop of at least 1 second', () => {
    // Verify there's a timeout-based reset near the isDraggingTab effect.
    // A fixed delay ensures the overlay cannot be wedged indefinitely
    // when no event arrives to clear it.
    const match = source.match(/setTimeout\(\s*reset\s*,\s*(\d+)\s*\)/)
    expect(match, 'expected setTimeout(reset, N) in TabGroup').not.toBeNull()
    const delay = parseInt(match![1], 10)
    expect(delay).toBeGreaterThanOrEqual(1000)
  })

  it('cleans up all listeners and the timer on effect teardown', () => {
    expect(source).toContain("removeEventListener('dragend'")
    expect(source).toContain("removeEventListener('drop'")
    expect(source).toContain("removeEventListener('blur'")
    expect(source).toContain('clearTimeout')
  })
})

/**
 * Behavior-level tests: simulate the effect's listener pattern directly so we
 * can assert that the overlay state resets in each scenario that used to
 * leave it stuck.
 */
describe('drag overlay reset behavior', () => {
  let isDraggingTab: boolean
  let cleanup: (() => void) | null = null

  function startDrag() {
    // Mirror the useEffect body from TabGroup.tsx
    isDraggingTab = true
    const reset = () => { isDraggingTab = false }
    const safetyTimer = setTimeout(reset, 3000)
    window.addEventListener('dragend', reset)
    window.addEventListener('drop', reset)
    window.addEventListener('blur', reset)
    cleanup = () => {
      clearTimeout(safetyTimer)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('drop', reset)
      window.removeEventListener('blur', reset)
    }
  }

  beforeEach(() => {
    isDraggingTab = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup?.()
    cleanup = null
    vi.useRealTimers()
  })

  it('resets on dragend (the normal case)', () => {
    startDrag()
    expect(isDraggingTab).toBe(true)
    window.dispatchEvent(new Event('dragend'))
    expect(isDraggingTab).toBe(false)
  })

  it('resets on drop (belt-and-suspenders if dragend is swallowed)', () => {
    startDrag()
    window.dispatchEvent(new Event('drop'))
    expect(isDraggingTab).toBe(false)
  })

  it('resets on window blur (drop landed over a <webview> and focus left)', () => {
    startDrag()
    window.dispatchEvent(new Event('blur'))
    expect(isDraggingTab).toBe(false)
  })

  it('resets via the safety timeout as an absolute backstop', () => {
    startDrag()
    expect(isDraggingTab).toBe(true)

    // Fast-forward past the safety timeout — overlay clears even if no event fires
    vi.advanceTimersByTime(3000)
    expect(isDraggingTab).toBe(false)
  })

  it('still resets before the safety timeout when an event arrives', () => {
    startDrag()
    vi.advanceTimersByTime(500)
    window.dispatchEvent(new Event('dragend'))
    expect(isDraggingTab).toBe(false)

    // Advancing further must not reintroduce the true state
    vi.advanceTimersByTime(5000)
    expect(isDraggingTab).toBe(false)
  })
})
