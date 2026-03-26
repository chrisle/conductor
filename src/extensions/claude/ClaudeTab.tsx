import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTabsStore } from '@/store/tabs'
import { useSidebarStore } from '@/store/sidebar'
import type { TabProps } from '@/extensions/types'
import TerminalTab from '../terminal/TerminalTab'

function Toggle({ on, onToggle, label, color = '#eab308' }: { on: boolean; onToggle: () => void; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onToggle}
        className="relative inline-flex h-3 w-5 shrink-0 cursor-pointer items-center rounded-full transition-colors"
        style={{ backgroundColor: on ? color : '#3f3f46' }}
      >
        <span
          className="block h-2 w-2 rounded-full bg-white shadow transition-transform"
          style={{ transform: on ? 'translateX(10px)' : 'translateX(2px)' }}
        />
      </button>
      <label
        onClick={onToggle}
        className="text-[10px] cursor-pointer select-none leading-none"
        style={{ color: on ? color : '#52525b' }}
      >
        {label}
      </label>
    </div>
  )
}

export default function ClaudeTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const [autoPilot, setAutoPilot] = useState(false)
  const [preventScreenClear, setPreventScreenClear] = useState(false)
  const [disableBackgroundTasks, setDisableBackgroundTasks] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const match = tab.initialCommand?.match(/--resume\s+(\S+)/)
    return match ? match[1] : null
  })
  const updateTab = useTabsStore(s => s.updateTab)
  const { rootPath } = useSidebarStore()
  const mountTimeRef = useRef(Date.now())
  const restartingRef = useRef(false)

  const handleThinkingChange = useCallback((thinking: boolean) => {
    updateTab(groupId, tabId, { isThinking: thinking })
  }, [groupId, tabId, updateTab])

  // Detect session ID for new/continue sessions by polling the sessions directory
  useEffect(() => {
    if (sessionId) return

    const projectPath = rootPath || tab.filePath
    if (!projectPath) return

    let cancelled = false
    const detect = async () => {
      for (let i = 0; i < 15; i++) {
        if (cancelled) return
        await new Promise(r => setTimeout(r, 2000))
        try {
          const sessions = await window.electronAPI.listClaudeSessions(projectPath)
          // For --continue, grab the newest session immediately
          // For new sessions, find one created after mount
          const isContinue = tab.initialCommand?.includes('--continue')
          const candidate = isContinue
            ? sessions[0]
            : sessions.find(s => s.mtime > mountTimeRef.current)
          if (candidate && !cancelled) {
            setSessionId(candidate.id)
            return
          }
        } catch { /* retry */ }
      }
    }
    detect()
    return () => { cancelled = true }
  }, [sessionId, rootPath, tab.filePath, tab.initialCommand])

  const handleToggleBackgroundTasks = useCallback(() => {
    if (!sessionId) return
    const newValue = !disableBackgroundTasks
    setDisableBackgroundTasks(newValue)

    if (restartingRef.current) return
    restartingRef.current = true

    // Exit Claude, then restart with/without the env var
    window.electronAPI.writeTerminal(tabId, '\x03') // Ctrl+C to cancel any operation
    setTimeout(() => {
      window.electronAPI.writeTerminal(tabId, '/exit\n')
      setTimeout(() => {
        const prefix = newValue ? 'CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 ' : ''
        window.electronAPI.writeTerminal(tabId, `${prefix}claude --resume ${sessionId}\n`)
        restartingRef.current = false
      }, 1500)
    }, 500)
  }, [tabId, sessionId, disableBackgroundTasks])

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-zinc-950">
      <div className="flex-1 min-h-0">
        <TerminalTab
          tabId={tabId}
          groupId={groupId}
          isActive={isActive}
          tab={{ ...tab, initialCommand: tab.initialCommand || "claude\n" }}
          autoPilot={autoPilot}
          preventScreenClear={preventScreenClear}
          onThinkingChange={handleThinkingChange}
        />
      </div>

      <div className="flex items-center gap-3 px-2 h-5 border-t border-zinc-800 shrink-0">
        <Toggle on={autoPilot} onToggle={() => setAutoPilot(!autoPilot)} label="Auto-pilot" />
        <Toggle on={preventScreenClear} onToggle={() => setPreventScreenClear(!preventScreenClear)} label="Prevent clear" color="#06b6d4" />
        <Toggle
          on={disableBackgroundTasks}
          onToggle={handleToggleBackgroundTasks}
          label="No bg tasks"
          color="#ef4444"
        />

        <div className="flex-1" />

        {sessionId && (
          <span
            className="text-[10px] font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[180px]"
            title={sessionId}
            onClick={() => navigator.clipboard.writeText(sessionId)}
          >
            {sessionId.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  )
}
