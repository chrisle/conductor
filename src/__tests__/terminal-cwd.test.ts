import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolveTerminalCwd, saveTerminalCwd, initHomeDir, getHomeDir } from '../lib/terminal-cwd'
import { useSidebarStore } from '../store/sidebar'
import { useConfigStore } from '../store/config'
import { DEFAULT_APP_CONFIG } from '../types/app-config'

function resetStores() {
  useSidebarStore.setState({ rootPath: null })
  useConfigStore.setState({
    config: { ...DEFAULT_APP_CONFIG },
    ready: true,
  })
}

describe('terminal-cwd', () => {
  beforeEach(() => {
    resetStores()
    vi.clearAllMocks()
    vi.mocked(window.electronAPI.getHomeDir).mockResolvedValue('/Users/testuser')
  })

  describe('initHomeDir', () => {
    it('fetches and caches the home directory from main process', async () => {
      await initHomeDir()
      expect(window.electronAPI.getHomeDir).toHaveBeenCalled()
      expect(getHomeDir()).toBe('/Users/testuser')
    })
  })

  describe('resolveTerminalCwd', () => {
    beforeEach(async () => {
      // Ensure home dir is initialized for all tests
      await initHomeDir()
    })

    it('returns sidebar rootPath when set', () => {
      useSidebarStore.setState({ rootPath: '/Users/testuser/projects/myapp' })
      expect(resolveTerminalCwd()).toBe('/Users/testuser/projects/myapp')
    })

    it('skips rootPath when it is a /var/folders temp path', () => {
      useSidebarStore.setState({ rootPath: '/var/folders/xx/yy/T/tmp123' })
      expect(resolveTerminalCwd()).toBe('/Users/testuser')
    })

    it('skips rootPath when it is a /private/var/folders temp path', () => {
      useSidebarStore.setState({ rootPath: '/private/var/folders/xx/yy/T/tmp123' })
      expect(resolveTerminalCwd()).toBe('/Users/testuser')
    })

    it('falls back to last-used terminal cwd when rootPath is null', () => {
      useConfigStore.setState({
        config: { ...DEFAULT_APP_CONFIG, lastTerminalCwd: '/Users/testuser/work' },
        ready: true,
      })
      expect(resolveTerminalCwd()).toBe('/Users/testuser/work')
    })

    it('skips lastTerminalCwd when it is a /var/folders path', () => {
      useConfigStore.setState({
        config: { ...DEFAULT_APP_CONFIG, lastTerminalCwd: '/var/folders/xx/yy/T/old' },
        ready: true,
      })
      expect(resolveTerminalCwd()).toBe('/Users/testuser')
    })

    it('falls back to home directory when no rootPath and no lastTerminalCwd', () => {
      expect(resolveTerminalCwd()).toBe('/Users/testuser')
    })

    it('prefers rootPath over lastTerminalCwd', () => {
      useSidebarStore.setState({ rootPath: '/Users/testuser/project-a' })
      useConfigStore.setState({
        config: { ...DEFAULT_APP_CONFIG, lastTerminalCwd: '/Users/testuser/project-b' },
        ready: true,
      })
      expect(resolveTerminalCwd()).toBe('/Users/testuser/project-a')
    })

    it('falls through rootPath -> lastTerminalCwd -> home when both are temp paths', () => {
      useSidebarStore.setState({ rootPath: '/var/folders/a/b/T/x' })
      useConfigStore.setState({
        config: { ...DEFAULT_APP_CONFIG, lastTerminalCwd: '/private/var/folders/c/d/T/y' },
        ready: true,
      })
      expect(resolveTerminalCwd()).toBe('/Users/testuser')
    })
  })

  describe('saveTerminalCwd', () => {
    it('persists a valid cwd to config', () => {
      saveTerminalCwd('/Users/testuser/projects')
      expect(window.electronAPI.patchConfig).toHaveBeenCalledWith({
        lastTerminalCwd: '/Users/testuser/projects',
      })
    })

    it('does not persist /var/folders paths', () => {
      saveTerminalCwd('/var/folders/xx/yy/T/bad')
      expect(window.electronAPI.patchConfig).not.toHaveBeenCalled()
    })

    it('does not persist /private/var/folders paths', () => {
      saveTerminalCwd('/private/var/folders/xx/yy/T/bad')
      expect(window.electronAPI.patchConfig).not.toHaveBeenCalled()
    })

    it('does not persist empty strings', () => {
      saveTerminalCwd('')
      expect(window.electronAPI.patchConfig).not.toHaveBeenCalled()
    })
  })
})
