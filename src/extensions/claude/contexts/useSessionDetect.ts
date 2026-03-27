import { useEffect, useRef, useState } from 'react'

/**
 * Polls for the Claude session ID associated with a terminal tab.
 * For --resume tabs, extracts it from the initial command.
 * For new/continue tabs, watches the sessions directory.
 */
export function useSessionDetect(
  initialCommand: string | undefined,
  projectPath: string | undefined,
) {
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const match = initialCommand?.match(/--resume\s+(\S+)/)
    if (match) {
      console.log('[session-detect] found session id from --resume:', match[1])
      return match[1]
    }
    return null
  })
  const mountTimeRef = useRef(Date.now())

  useEffect(() => {
    if (sessionId) return
    if (!projectPath) return

    let cancelled = false
    const detect = async () => {
      console.log('[session-detect] polling started, path:', projectPath, 'mountTime:', mountTimeRef.current)
      for (let i = 0; i < 15; i++) {
        if (cancelled) return
        await new Promise(r => setTimeout(r, 2000))
        try {
          const sessions = await window.electronAPI.listClaudeSessions(projectPath)
          // Sessions are already filtered by cwd — pick the most recent one started after mount
          const candidate = sessions.find(s => s.mtime > mountTimeRef.current) ?? sessions[0]
          if (candidate && !cancelled) {
            console.log('[session-detect] matched session:', candidate.id, 'path:', projectPath)
            setSessionId(candidate.id)
            return
          }
        } catch (e) {
          console.warn('[session-detect] error:', e)
        }
      }
      console.warn('[session-detect] gave up after 15 attempts, path:', projectPath)
    }
    detect()
    return () => { cancelled = true }
  }, [sessionId, projectPath, initialCommand])

  return sessionId
}
