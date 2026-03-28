/**
 * Tracks the "is thinking" state for tmux sessions.
 *
 * For sessions that have an open tab, `isThinking` is already updated by
 * useThinkingDetect inside the ClaudeTab. For sessions with no open tab we
 * open a silent background WebSocket to conductord so we still receive PTY
 * data and can run the same detection logic.
 */
import { useEffect, useRef, useState } from 'react'
import { useTabsStore } from '@/store/tabs'
import { getThinkingState, stripAnsi, type ThinkingState } from '@/lib/terminal-detection'

const CONDUCTORD_WS = 'ws://127.0.0.1:9800/ws/terminal'

export function useSessionThinking(sessions: string[]): Record<string, ThinkingState> {
  const groups = useTabsStore(s => s.groups)
  const [bgThinking, setBgThinking] = useState<Record<string, ThinkingState>>({})

  // Track which sessions currently have an open tab
  const openTabIds = new Set(
    Object.values(groups).flatMap(g => g.tabs).map(t => t.id)
  )

  // Map of session name → background WebSocket (only for sessions without a tab)
  const socketsRef = useRef<Map<string, WebSocket>>(new Map())
  const buffersRef = useRef<Map<string, string>>(new Map())
  const decoders = useRef<Map<string, TextDecoder>>(new Map())
  const thinkingRef = useRef<Map<string, boolean>>(new Map())
  const offTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const current = socketsRef.current
    const wanted = new Set(sessions.filter(s => !openTabIds.has(s)))

    // Close sockets for sessions that now have an open tab or are no longer listed
    for (const [name, ws] of current) {
      if (!wanted.has(name)) {
        ws.close()
        current.delete(name)
        buffersRef.current.delete(name)
        decoders.current.delete(name)
        const t = offTimersRef.current.get(name)
        if (t) { clearTimeout(t); offTimersRef.current.delete(name) }
        thinkingRef.current.delete(name)
      }
    }

    // Open sockets for sessions that need monitoring
    for (const name of wanted) {
      if (current.has(name)) continue

      const params = new URLSearchParams({ id: name })
      const ws = new WebSocket(`${CONDUCTORD_WS}?${params}`)
      ws.binaryType = 'arraybuffer'
      current.set(name, ws)
      buffersRef.current.set(name, '')
      decoders.current.set(name, new TextDecoder('utf-8'))

      ws.onmessage = (event) => {
        let text: string
        if (typeof event.data === 'string') {
          // JSON control message (session, error) — skip
          return
        }
        const decoder = decoders.current.get(name) ?? new TextDecoder('utf-8')
        text = decoder.decode(event.data, { stream: true })

        let buf = (buffersRef.current.get(name) ?? '') + text
        if (buf.length > 8192) buf = buf.slice(-8192)
        buffersRef.current.set(name, buf)

        // Check only the recent tail to avoid stale done/thinking matches
        const tail = buf.slice(-1024)
        const { thinking, time, done } = getThinkingState(stripAnsi(tail))

        if (thinking) {
          const existing = offTimersRef.current.get(name)
          if (existing) { clearTimeout(existing); offTimersRef.current.delete(name) }
          const prev = thinkingRef.current.get(name)
          if (!prev || prev.time !== time) {
            thinkingRef.current.set(name, true)
            setBgThinking(s => ({ ...s, [name]: { thinking: true, time } }))
          }
        } else if (done && thinkingRef.current.get(name)) {
          // "Cooked for…" — clear immediately
          const existing = offTimersRef.current.get(name)
          if (existing) { clearTimeout(existing); offTimersRef.current.delete(name) }
          thinkingRef.current.set(name, false)
          buffersRef.current.set(name, '')
          setBgThinking(s => ({ ...s, [name]: { thinking: false } }))
        } else if (thinkingRef.current.get(name)) {
          const existing = offTimersRef.current.get(name)
          if (existing) clearTimeout(existing)
          const timer = setTimeout(() => {
            offTimersRef.current.delete(name)
            thinkingRef.current.set(name, false)
            buffersRef.current.set(name, '')
            setBgThinking(s => ({ ...s, [name]: { thinking: false } }))
          }, 3000)
          offTimersRef.current.set(name, timer)
        }
      }

      ws.onclose = () => {
        current.delete(name)
        buffersRef.current.delete(name)
        decoders.current.delete(name)
        const t = offTimersRef.current.get(name)
        if (t) { clearTimeout(t); offTimersRef.current.delete(name) }
        thinkingRef.current.delete(name)
      }
    }
  }, [sessions, openTabIds.size]) // eslint-disable-line react-hooks/exhaustive-deps

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
