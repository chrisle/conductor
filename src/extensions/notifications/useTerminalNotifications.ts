/**
 * Hook that listens for terminal data events and generates notifications
 * based on detected patterns (completion, errors, bell chars).
 *
 * Mounts once at the extension level and monitors all terminal sessions.
 */

import { useEffect, useRef } from 'react'
import { onTerminalData, offTerminalData, onTerminalExit, offTerminalExit } from '@/lib/terminal-api'
import { useTabsStore } from '@/store/tabs'
import { useNotificationsStore } from '@/store/notifications'
import { detectNotification, detectExitNotification } from './notification-detector'

/** Minimum ms between notifications from the same tab to avoid spam */
const DEBOUNCE_MS = 3000

export function useTerminalNotifications(): void {
  const lastFireRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const handleData = (_event: unknown, id: string, data: string) => {
      const { settings } = useNotificationsStore.getState()
      if (!settings.enabled) return

      // Find the tab and group for this terminal session
      const { groups } = useTabsStore.getState()
      let tabTitle = id
      let groupId: string | null = null

      for (const [gid, group] of Object.entries(groups)) {
        const tab = group.tabs.find(t => t.id === id)
        if (tab) {
          tabTitle = tab.title
          groupId = gid

          // Skip notifications for the currently active/focused tab
          if (group.activeTabId === id) return
          break
        }
      }

      // Debounce per-tab
      const now = Date.now()
      const lastFire = lastFireRef.current.get(id) || 0
      if (now - lastFire < DEBOUNCE_MS) return

      const detected = detectNotification(data, tabTitle)
      if (detected) {
        lastFireRef.current.set(id, now)
        useNotificationsStore.getState().addNotification({
          ...detected,
          sourceTabId: id,
          sourceGroupId: groupId,
        })
      }
    }

    const handleExit = (_event: unknown, id: string) => {
      const { settings } = useNotificationsStore.getState()
      if (!settings.enabled || !settings.processExit) return

      const { groups } = useTabsStore.getState()
      let tabTitle = id
      let groupId: string | null = null

      for (const [gid, group] of Object.entries(groups)) {
        const tab = group.tabs.find(t => t.id === id)
        if (tab) {
          tabTitle = tab.title
          groupId = gid
          break
        }
      }

      const detected = detectExitNotification(tabTitle)
      useNotificationsStore.getState().addNotification({
        ...detected,
        sourceTabId: id,
        sourceGroupId: groupId,
      })
    }

    onTerminalData(handleData)
    onTerminalExit(handleExit)

    return () => {
      offTerminalData(handleData)
      offTerminalExit(handleExit)
    }
  }, [])
}
