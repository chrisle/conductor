import { useTabsStore } from '@/store/tabs'

/**
 * Generate a unique session ID (e.g. "claude-code-4") that won't collide with
 * open tabs or lingering tmux sessions from previously closed tabs.
 *
 * Uses a localStorage-backed monotonic counter so IDs are never reused, even
 * across app restarts.
 */
export function nextSessionId(prefix: string): string {
  const key = `conductor:sessionSeq:${prefix}`
  let n = parseInt(localStorage.getItem(key) || '0', 10)
  const groups = useTabsStore.getState().groups
  const existing = new Set<string>()
  for (const group of Object.values(groups)) {
    for (const tab of group.tabs) {
      if (tab.id.startsWith(`${prefix}-`)) existing.add(tab.id)
    }
  }
  do { n++ } while (existing.has(`${prefix}-${n}`))
  localStorage.setItem(key, String(n))
  return `${prefix}-${n}`
}
