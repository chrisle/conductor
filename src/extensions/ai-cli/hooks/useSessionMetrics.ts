import { useEffect, useRef, useState } from 'react'

export interface SessionMetrics {
  contextPercent: number | null
  inputSpeed: number | null
  outputSpeed: number | null
  model: string | null
}

const POLL_INTERVAL_MS = 3_000

/**
 * Polls Claude session metrics (context %, token speeds, model) via IPC.
 * Only polls while a sessionId and projectPath are available.
 */
export function useSessionMetrics(
  sessionId: string | null,
  projectPath: string | undefined,
): SessionMetrics | null {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const activeRef = useRef(true)

  useEffect(() => {
    activeRef.current = true
    if (!sessionId || !projectPath) {
      setMetrics(null)
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (!activeRef.current) return
      try {
        const result = await window.electronAPI.getSessionMetrics(sessionId, projectPath)
        if (activeRef.current && result) {
          setMetrics(result)
        }
      } catch {
        // IPC failure — leave last known metrics in place
      }
      if (activeRef.current) {
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()

    return () => {
      activeRef.current = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, projectPath])

  return metrics
}
