import { describe, it, expect } from 'vitest'
import { cn } from '../lib/utils'

/**
 * Tests for tab highlighting logic (CON-47).
 *
 * Only the active tab in the focused pane should get the blue highlight.
 * Active tabs in unfocused panes should have a muted style.
 */

// Mirrors the className logic from TabGroup.tsx lines 869-881
function computeTabClasses(opts: {
  isActive: boolean
  isFocused: boolean
  isDragOver?: boolean
  isThinking?: boolean
  isMultiSelected?: boolean
}) {
  return cn(
    'flex items-center gap-1.5 px-3 h-8 cursor-pointer select-none border-r border-zinc-700/40 shrink-0 max-w-[180px] group/tab transition-colors',
    opts.isActive
      // Only the focused pane's active tab gets the blue highlight
      ? opts.isFocused
        ? 'bg-zinc-950 text-zinc-50 border-t-2 border-t-blue-400'
        : 'bg-zinc-900/80 text-zinc-400'
      : 'bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200',
    opts.isDragOver && 'border-l-2 border-l-blue-400',
    opts.isActive && opts.isThinking && 'tab-thinking-bar',
    opts.isMultiSelected && !opts.isActive && 'bg-blue-900/30 text-zinc-200'
  )
}

describe('Tab highlight classes (CON-47)', () => {
  it('active tab in focused pane gets blue highlight', () => {
    const classes = computeTabClasses({ isActive: true, isFocused: true })
    expect(classes).toContain('border-t-blue-400')
    expect(classes).toContain('text-zinc-50')
  })

  it('active tab in unfocused pane gets muted style', () => {
    const classes = computeTabClasses({ isActive: true, isFocused: false })
    expect(classes).toContain('text-zinc-400')
    expect(classes).not.toContain('border-t-blue-400')
    expect(classes).not.toContain('text-zinc-50')
  })

  it('inactive tab looks the same regardless of pane focus', () => {
    const focusedClasses = computeTabClasses({ isActive: false, isFocused: true })
    const unfocusedClasses = computeTabClasses({ isActive: false, isFocused: false })
    expect(focusedClasses).toBe(unfocusedClasses)
    expect(focusedClasses).toContain('bg-zinc-900/60')
    expect(focusedClasses).not.toContain('border-t-blue-400')
  })

  it('thinking bar only applies to active tabs', () => {
    const activeThinking = computeTabClasses({ isActive: true, isFocused: true, isThinking: true })
    expect(activeThinking).toContain('tab-thinking-bar')

    const inactiveThinking = computeTabClasses({ isActive: false, isFocused: true, isThinking: true })
    expect(inactiveThinking).not.toContain('tab-thinking-bar')
  })

  it('multi-select highlight only applies to non-active tabs', () => {
    const multiSelectedInactive = computeTabClasses({ isActive: false, isFocused: true, isMultiSelected: true })
    expect(multiSelectedInactive).toContain('bg-blue-900/30')

    const multiSelectedActive = computeTabClasses({ isActive: true, isFocused: true, isMultiSelected: true })
    expect(multiSelectedActive).not.toContain('bg-blue-900/30')
  })
})
