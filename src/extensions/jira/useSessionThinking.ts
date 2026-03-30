/**
 * Tracks the "is thinking" state for tmux sessions.
 *
 * For sessions that have an open tab, `isThinking` is already updated by
 * useThinkingDetect inside the ClaudeTab. For sessions with no open tab we
 * create a terminal connection via IPC so we still receive PTY data and can
 * run the same detection logic.
 */
import { useEffect, useRef, useState } from 'react'
import { useTabsStore } from '@/store/tabs'
import { getThinkingState, stripAnsi, type ThinkingState } from '@/lib/terminal-detection'

export function useSessionThinking(sessions: string[]): Record<string, ThinkingState> {
  const groups = useTabsStore(s => s.groups)
  const [bgThinking, setBgThinking] = useState<Record<string, ThinkingState>>({})

  // Track which sessions currently have an open tab
  const openTabIds = new Set(
    Object.values(groups).flatMap(g => g.tabs).map(t => t.id)
  )

  // Set of session names with active background connections
  const bgSessionsRef = useRef<Set<string>>(new Set())
  const buffersRef = useRef<Map<string, string>>(new Map())
  const thinkingRef = useRef<Map<string, boolean>>(new Map())
  const offTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const current = bgSessionsRef.current
    const wanted = new Set(sessions.filter(s => !openTabIds.has(s)))

    // Kill connections for sessions that now have an open tab or are no longer listed
    for (const name of current) {
      if (!wanted.has(name)) {
        window.electronAPI.killTerminal(name)
        current.delete(name)
        buffersRef.current.delete(name)
        const t = offTimersRef.current.get(name)
        if (t) { clearTimeout(t); offTimersRef.current.delete(name) }
        thinkingRef.current.delete(name)
      }
    }

    // Open connections for sessions that need monitoring
    for (const name of wanted) {
      if (current.has(name)) continue

      current.add(name)
      buffersRef.current.set(name, '')

      // Attach to existing tmux session (isNew will be false)
      window.electronAPI.createTerminal(name).catch(() => {
        current.delete(name)
      })
    }
  }, [sessions, openTabIds.size]) // eslint-disable-line react-hooks/exhaustive-deps

  // Single shared listener for all background session data
  useEffect(() => {
    const handler = (_event: any, id: string, text: string) => {
      if (!bgSessionsRef.current.has(id)) return

      let buf = (buffersRef.current.get(id) ?? '') + text
      if (buf.length > 8192) buf = buf.slice(-8192)
      buffersRef.current.set(id, buf)

      const tail = buf.slice(-1024)
      const { thinking, time, done } = getThinkingState(stripAnsi(tail))

      if (thinking) {
        const existing = offTimersRef.current.get(id)
        if (existing) { clearTimeout(existing); offTimersRef.current.delete(id) }
        const prev = thinkingRef.current.get(id)
        if (!prev) {
          thinkingRef.current.set(id, true)
          setBgThinking(s => ({ ...s, [id]: { thinking: true, time } }))
        }
      } else if (done && thinkingRef.current.get(id)) {
        const existing = offTimersRef.current.get(id)
        if (existing) { clearTimeout(existing); offTimersRef.current.delete(id) }
        thinkingRef.current.set(id, false)
        buffersRef.current.set(id, '')
        setBgThinking(s => ({ ...s, [id]: { thinking: false } }))
      } else if (thinkingRef.current.get(id)) {
        const existing = offTimersRef.current.get(id)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          offTimersRef.current.delete(id)
          thinkingRef.current.set(id, false)
          buffersRef.current.set(id, '')
          setBgThinking(s => ({ ...s, [id]: { thinking: false } }))
        }, 3000)
        offTimersRef.current.set(id, timer)
      }
    }

    window.electronAPI.onTerminalData(handler)
    return () => {
      window.electronAPI.offTerminalData(handler)
    }
  }, [])

  // Merge: tab store wins for open tabs, background ws for the rest
  const result: Record<string, ThinkingState> = {}
  for (const name of sessions) {
    if (openTabIds.has(name)) {
      const tab = Object.values(groups)
        .flatMap(g => g.tabs)
        .find(t => t.id === name)
      result[name] = { thinking: tab?.isThinking ?? false, time: tab?.thinkingTime }
    } else {
      result[name] = bgThinking[name] ?? { thinking: false }
    }
  }
  return result
}
