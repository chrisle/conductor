import { useSidebarStore } from '@/store/sidebar'
import { useConfigStore } from '@/store/config'

/**
 * Returns true if the path is a macOS temporary directory that should
 * never be used as a terminal starting directory.
 */
function isTempPath(p: string): boolean {
  return p.startsWith('/var/folders') || p.startsWith('/private/var/folders')
}

// Cached home directory resolved once from the main process
let cachedHomeDir: string | null = null

/**
 * Fetches the user's home directory from the main process and caches it.
 * Must be called once at app startup before resolveTerminalCwd is used.
 */
export async function initHomeDir(): Promise<void> {
  if (cachedHomeDir) return
  try {
    cachedHomeDir = await window.electronAPI.getHomeDir()
  } catch {
    // Fallback: infer from environment or use a safe default
    cachedHomeDir = '/Users'
  }
}

export function getHomeDir(): string {
  return cachedHomeDir ?? '/Users'
}

/**
 * Resolves the best working directory for a new terminal tab, in priority order:
 * 1. Sidebar rootPath (the currently open project)
 * 2. Last-used terminal directory (persisted across restarts in config)
 * 3. User's home directory
 *
 * Never returns a /var/folders path.
 */
export function resolveTerminalCwd(): string {
  const rootPath = useSidebarStore.getState().rootPath
  if (rootPath && !isTempPath(rootPath)) return rootPath

  const lastCwd = useConfigStore.getState().config.lastTerminalCwd
  if (lastCwd && !isTempPath(lastCwd)) return lastCwd

  return getHomeDir()
}

/**
 * Persists the given directory as the last-used terminal cwd in app config.
 * Skips /var/folders paths to avoid persisting bad values.
 */
export function saveTerminalCwd(cwd: string): void {
  if (!cwd || isTempPath(cwd)) return
  useConfigStore.getState().patchConfig({ lastTerminalCwd: cwd })
}
