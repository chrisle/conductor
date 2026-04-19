/**
 * Maximize-toggle logic for the application window.
 *
 * Extracted from the 'window:maximize' IPC handler in electron/main/ipc.ts so
 * it can be unit-tested without pulling in Electron's native module. The file
 * has no Electron imports — it takes a minimal interface matching
 * BrowserWindow.
 */

export interface MaximizeTogglableWindow {
  isMaximizable(): boolean
  setMaximizable(value: boolean): void
  isMaximized(): boolean
  maximize(): void
  unmaximize(): void
  isDestroyed(): boolean
  once(event: 'maximize' | 'unmaximize', listener: () => void): unknown
}

/**
 * Toggle the maximized state of a window.
 *
 * On macOS, `maximizable: false` is set on BrowserWindow creation to prevent
 * accidental OS-triggered maximize (e.g. double-click on a drag region). For
 * explicit user-initiated maximize we must briefly re-enable the flag. The
 * window of vulnerability is kept as narrow as possible:
 *
 *   1. We listen for the `maximize`/`unmaximize` event and reset the flag as
 *      soon as Electron emits it.
 *   2. A 50ms fallback timer ensures we don't wedge the flag to `true` if the
 *      event never fires (e.g. the window is already in the target state).
 */
export function toggleMaximize(
  win: MaximizeTogglableWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  const needsToggle = platform === 'darwin' && !win.isMaximizable()
  if (needsToggle) win.setMaximizable(true)
  const wasMaximized = win.isMaximized()
  if (needsToggle) {
    let done = false
    const reset = () => {
      if (done || win.isDestroyed()) return
      done = true
      win.setMaximizable(false)
    }
    win.once(wasMaximized ? 'unmaximize' : 'maximize', reset)
    setTimeout(reset, 50)
  }
  if (wasMaximized) win.unmaximize()
  else win.maximize()
}
