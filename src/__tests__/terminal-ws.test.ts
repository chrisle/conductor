import { describe, it, expect, beforeEach, vi } from 'vitest'

// We need to reset the module state between tests since terminal-ws has
// module-level state (activeSessions, listeners, ipcListenersRegistered).
// Use dynamic imports to get fresh module state per test.

// Add the missing mock methods to window.electronAPI
beforeEach(() => {
  vi.clearAllMocks()
  ;(window.electronAPI as any).setAutoPilot = vi.fn()
  ;(window.electronAPI as any).setTmuxOption = vi.fn()
  ;(window.electronAPI as any).capturePane = vi.fn().mockResolvedValue('pane content')
  // Reset the createTerminal mock to return a proper value
  vi.mocked(window.electronAPI.createTerminal).mockResolvedValue({ isNew: true } as any)
  vi.mocked(window.electronAPI.writeTerminal).mockImplementation(() => undefined as any)
  vi.mocked(window.electronAPI.resizeTerminal).mockImplementation(() => undefined as any)
  vi.mocked(window.electronAPI.killTerminal).mockResolvedValue(undefined as any)
  // Make onTerminalData/onTerminalExit capture their callbacks
  vi.mocked(window.electronAPI.onTerminalData).mockImplementation(() => undefined as any)
  vi.mocked(window.electronAPI.onTerminalExit).mockImplementation(() => undefined as any)
})

describe('terminal-ws', () => {
  // Use a fresh import for each test to reset module state
  async function freshImport() {
    // Clear the module from cache to get fresh state
    const modulePath = '../lib/terminal-ws'
    vi.resetModules()
    return await import(modulePath)
  }

  describe('createTerminal', () => {
    it('calls electronAPI.createTerminal with id and cwd', async () => {
      const mod = await freshImport()
      await mod.createTerminal('tab-1', '/home/user')
      expect(window.electronAPI.createTerminal).toHaveBeenCalledWith('tab-1', '/home/user')
    })

    it('returns the result from electronAPI', async () => {
      vi.mocked(window.electronAPI.createTerminal).mockResolvedValue({ isNew: false, autoPilot: true } as any)
      const mod = await freshImport()
      const result = await mod.createTerminal('tab-1')
      expect(result).toEqual({ isNew: false, autoPilot: true })
    })
  })

  describe('writeTerminal', () => {
    it('calls electronAPI.writeTerminal for active sessions', async () => {
      const mod = await freshImport()
      await mod.createTerminal('tab-1')
      await mod.writeTerminal('tab-1', 'ls -la')
      expect(window.electronAPI.writeTerminal).toHaveBeenCalledWith('tab-1', 'ls -la')
    })

    it('does nothing for non-active sessions', async () => {
      const mod = await freshImport()
      await mod.writeTerminal('nonexistent', 'ls')
      expect(window.electronAPI.writeTerminal).not.toHaveBeenCalled()
    })

    it('splits programmatic writes at newline with delay', async () => {
      vi.useFakeTimers()
      const mod = await freshImport()
      await mod.createTerminal('tab-1')
      const promise = mod.writeTerminal('tab-1', 'echo hello\n', { programmatic: true })
      // First part written immediately
      expect(window.electronAPI.writeTerminal).toHaveBeenCalledWith('tab-1', 'echo hello')
      // Second part after timeout
      vi.advanceTimersByTime(150)
      await promise
      expect(window.electronAPI.writeTerminal).toHaveBeenCalledWith('tab-1', '\n')
      vi.useRealTimers()
    })

    it('does not split when no newline in programmatic write', async () => {
      const mod = await freshImport()
      await mod.createTerminal('tab-1')
      await mod.writeTerminal('tab-1', 'echo hello', { programmatic: true })
      expect(window.electronAPI.writeTerminal).toHaveBeenCalledWith('tab-1', 'echo hello')
      expect(window.electronAPI.writeTerminal).toHaveBeenCalledTimes(1)
    })
  })

  describe('resizeTerminal', () => {
    it('calls electronAPI.resizeTerminal', async () => {
      const mod = await freshImport()
      await mod.createTerminal('tab-1')
      await mod.resizeTerminal('tab-1', 80, 24)
      expect(window.electronAPI.resizeTerminal).toHaveBeenCalledWith('tab-1', 80, 24)
    })
  })

  describe('killTerminal', () => {
    it('removes session from active set and calls electronAPI', async () => {
      const mod = await freshImport()
      await mod.createTerminal('tab-1')
      await mod.killTerminal('tab-1')
      expect(window.electronAPI.killTerminal).toHaveBeenCalledWith('tab-1')
      // After kill, writes should be no-ops
      await mod.writeTerminal('tab-1', 'test')
      expect(window.electronAPI.writeTerminal).not.toHaveBeenCalled()
    })
  })

  describe('setTmuxOption', () => {
    it('calls electronAPI.setTmuxOption', async () => {
      const mod = await freshImport()
      mod.setTmuxOption('tab-1', 'mouse', 'on')
      expect((window.electronAPI as any).setTmuxOption).toHaveBeenCalledWith('tab-1', 'mouse', 'on')
    })
  })

  describe('setAutoPilot', () => {
    it('calls electronAPI.setAutoPilot', async () => {
      const mod = await freshImport()
      mod.setAutoPilot('tab-1', true)
      expect((window.electronAPI as any).setAutoPilot).toHaveBeenCalledWith('tab-1', true)
    })
  })

  describe('capturePane', () => {
    it('calls electronAPI.capturePane and returns result', async () => {
      const mod = await freshImport()
      const result = await mod.capturePane('tab-1')
      expect(result).toBe('pane content')
      expect((window.electronAPI as any).capturePane).toHaveBeenCalledWith('tab-1')
    })
  })

  describe('data/exit listeners', () => {
    it('onTerminalData registers a listener', async () => {
      const mod = await freshImport()
      const cb = vi.fn()
      mod.onTerminalData(cb)
      // Should have registered IPC listeners
      expect(window.electronAPI.onTerminalData).toHaveBeenCalled()
    })

    it('offTerminalData removes a listener', async () => {
      const mod = await freshImport()
      const cb = vi.fn()
      mod.onTerminalData(cb)
      mod.offTerminalData(cb)
      // No direct way to verify removal, but it shouldn't throw
    })

    it('onTerminalExit registers a listener', async () => {
      const mod = await freshImport()
      const cb = vi.fn()
      mod.onTerminalExit(cb)
      expect(window.electronAPI.onTerminalExit).toHaveBeenCalled()
    })

    it('offTerminalExit removes a listener', async () => {
      const mod = await freshImport()
      const cb = vi.fn()
      mod.onTerminalExit(cb)
      mod.offTerminalExit(cb)
      // No direct way to verify removal, but it shouldn't throw
    })
  })
})
