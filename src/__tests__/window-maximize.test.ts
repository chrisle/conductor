import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toggleMaximize, type MaximizeTogglableWindow } from '../lib/window-maximize'

/**
 * Tests for the maximize-toggle logic used by the 'window:maximize' IPC
 * handler.
 *
 * Bug fix: on macOS, BrowserWindow is constructed with maximizable: false to
 * block OS-triggered maximize (e.g. double-click on the drag region of the
 * title bar). For the explicit toggle we temporarily re-enable the flag.
 * The pre-fix implementation held maximizable=true for a fixed 200ms — long
 * enough that a stray double-click could arrive during that window and
 * trigger an unwanted maximize. These tests verify the new event-driven
 * reset resolves synchronously on the 'maximize'/'unmaximize' event and
 * uses only a 50ms fallback.
 */

type ListenerMap = { [k in 'maximize' | 'unmaximize']?: () => void }

function createFakeWindow(overrides: Partial<MaximizeTogglableWindow> & { maximized?: boolean; maximizable?: boolean } = {}) {
  const state = {
    maximized: overrides.maximized ?? false,
    maximizable: overrides.maximizable ?? false,
    destroyed: false,
  }
  const listeners: ListenerMap = {}
  const win: MaximizeTogglableWindow & {
    _state: typeof state
    _fire: (event: 'maximize' | 'unmaximize') => void
    setMaximizable: ReturnType<typeof vi.fn>
    maximize: ReturnType<typeof vi.fn>
    unmaximize: ReturnType<typeof vi.fn>
    once: ReturnType<typeof vi.fn>
  } = {
    _state: state,
    _fire(event) {
      listeners[event]?.()
    },
    isMaximizable: () => state.maximizable,
    setMaximizable: vi.fn((v: boolean) => { state.maximizable = v }),
    isMaximized: () => state.maximized,
    maximize: vi.fn(() => { state.maximized = true }),
    unmaximize: vi.fn(() => { state.maximized = false }),
    isDestroyed: () => state.destroyed,
    once: vi.fn((event: 'maximize' | 'unmaximize', cb: () => void) => {
      listeners[event] = cb
      return win
    }),
  }
  return win
}

describe('toggleMaximize', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('maximizes the window and resets maximizable on the maximize event (darwin)', () => {
    const win = createFakeWindow({ maximized: false, maximizable: false })

    toggleMaximize(win, 'darwin')

    // Flag is re-enabled, then the window is told to maximize
    expect(win.setMaximizable).toHaveBeenNthCalledWith(1, true)
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(win.unmaximize).not.toHaveBeenCalled()

    // The event-driven reset is armed on the 'maximize' event
    expect(win.once).toHaveBeenCalledWith('maximize', expect.any(Function))

    // Fire the event — flag resets immediately, not 200ms later
    win._fire('maximize')
    expect(win.setMaximizable).toHaveBeenLastCalledWith(false)
    expect(win._state.maximizable).toBe(false)
  })

  it('unmaximizes the window and resets maximizable on the unmaximize event (darwin)', () => {
    const win = createFakeWindow({ maximized: true, maximizable: false })

    toggleMaximize(win, 'darwin')

    expect(win.unmaximize).toHaveBeenCalledOnce()
    expect(win.maximize).not.toHaveBeenCalled()
    expect(win.once).toHaveBeenCalledWith('unmaximize', expect.any(Function))

    win._fire('unmaximize')
    expect(win._state.maximizable).toBe(false)
  })

  it('falls back to a 50ms timer (not 200ms) if the state event never fires', () => {
    const win = createFakeWindow({ maximized: false, maximizable: false })

    toggleMaximize(win, 'darwin')

    // Before the fallback fires, flag is still true
    expect(win._state.maximizable).toBe(true)

    // At 49ms — still open: this is the narrow window where a double-click
    // *could* sneak in. Must be short.
    vi.advanceTimersByTime(49)
    expect(win._state.maximizable).toBe(true)

    // At 50ms the fallback fires and the flag resets
    vi.advanceTimersByTime(1)
    expect(win._state.maximizable).toBe(false)
  })

  it('only resets once even if both the event and the fallback fire', () => {
    const win = createFakeWindow({ maximized: false, maximizable: false })

    toggleMaximize(win, 'darwin')

    win._fire('maximize')
    vi.advanceTimersByTime(100)

    // setMaximizable called exactly twice: once(true) to open the window,
    // once(false) to close it. The duplicate reset is swallowed by the
    // `done` guard.
    expect(win.setMaximizable).toHaveBeenCalledTimes(2)
    expect(win.setMaximizable).toHaveBeenNthCalledWith(1, true)
    expect(win.setMaximizable).toHaveBeenNthCalledWith(2, false)
  })

  it('does not touch setMaximizable on non-darwin platforms', () => {
    const win = createFakeWindow({ maximized: false, maximizable: true })

    toggleMaximize(win, 'linux')

    expect(win.setMaximizable).not.toHaveBeenCalled()
    expect(win.maximize).toHaveBeenCalledOnce()
    expect(win.once).not.toHaveBeenCalled()
  })

  it('does not touch setMaximizable on darwin when it is already enabled', () => {
    const win = createFakeWindow({ maximized: false, maximizable: true })

    toggleMaximize(win, 'darwin')

    // Already enabled, so no toggle path is taken
    expect(win.setMaximizable).not.toHaveBeenCalled()
    expect(win.once).not.toHaveBeenCalled()
    expect(win.maximize).toHaveBeenCalledOnce()
  })

  it('no-ops reset if the window is destroyed before the event fires', () => {
    const win = createFakeWindow({ maximized: false, maximizable: false })
    toggleMaximize(win, 'darwin')

    win._state.destroyed = true
    win._fire('maximize')
    // setMaximizable(false) must not be called on a destroyed window
    expect(win.setMaximizable).toHaveBeenCalledTimes(1) // only the (true) call
    expect(win.setMaximizable).toHaveBeenCalledWith(true)
  })
})
