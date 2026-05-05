/**
 * Reap orphaned terminal sessions.
 *
 * The X button on a tab calls closeTab() which removes the React tab but
 * leaves the underlying conductord PTY alive (intentional — supports
 * reopen/reattach). Across an app restart, sessionStorage is wiped so the
 * reattach is already broken. Yet the orphan PTY lingers in conductord,
 * inflating the session count and leaking memory.
 *
 * On startup, after tabs have been restored, walk the live conductord
 * sessions and kill any claude-code-* / codex-* session whose ID isn't
 * a current tab.
 */
import { killTerminal } from '@/lib/terminal-api'
import { useTabsStore } from '@/store/tabs'

const REAP_PREFIXES = ['claude-code-', 'codex-']

export async function reapOrphanTerminalSessions(): Promise<number> {
  try {
    const list = await window.electronAPI.conductordGetSessions()
    const tabIds = new Set<string>()
    for (const group of Object.values(useTabsStore.getState().groups)) {
      for (const tab of group.tabs) tabIds.add(tab.id)
    }

    const orphans = list.filter(s =>
      !s.dead
      && REAP_PREFIXES.some(p => s.id.startsWith(p))
      && !tabIds.has(s.id),
    )

    await Promise.allSettled(orphans.map(s => killTerminal(s.id)))
    if (orphans.length > 0) {
      console.log(`[reap] killed ${orphans.length} orphan terminal session(s):`, orphans.map(s => s.id))
    }
    return orphans.length
  } catch (err) {
    console.warn('[reap] failed:', err)
    return 0
  }
}
