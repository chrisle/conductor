import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useSidebarStore } from '@/store/sidebar'
import type { TabProps } from '@/extensions/types'
import TerminalTab from '../../terminal/TerminalTab'
import Toggle from './Toggle'
import { usePtyHandlers } from '../pty-handlers/usePtyHandlers'
import { useSessionDetect } from '../contexts/useSessionDetect'
import { useClaudeCodeSettings } from '../contexts/useClaudeCodeSettings'
import { buildClaudeCommand } from '../contexts/buildClaudeCommand'
import { setAutoPilot as setAutoPilotWs } from '@/lib/terminal-api'
import { useTabsStore } from '@/store/tabs'
import { useWorkSessionsStore } from '@/store/work-sessions'

// Extract a Jira ticket key (e.g. "PROJ-123") from the tab title.
function extractTicketKey(title: string): string | null {
  const match = title.match(/([A-Z]+-\d+)/)
  return match ? match[1] : null
}

export default function ClaudeCodeTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const settings = useClaudeCodeSettings()
  const [autoPilot, setAutoPilot] = useState(tab.autoPilot ?? false)
  const [preventScreenClear, setPreventScreenClear] = useState(false)
  const [disableBackgroundTasks, setDisableBackgroundTasks] = useState(settings.disableBackgroundTasks)
  const { rootPath } = useSidebarStore()
  const { updateTab } = useTabsStore()
  const writeRef = useRef<((data: string) => void) | null>(null)
  const restartingRef = useRef(false)
  const autoPilotRef = useRef(autoPilot)

  useEffect(() => { autoPilotRef.current = autoPilot }, [autoPilot])

  // Sync autopilot state to conductord whenever it changes
  useEffect(() => {
    setAutoPilotWs(tabId, autoPilot)
  }, [autoPilot, tabId])

  const projectPath = tab.filePath || rootPath
  const sessionId = useSessionDetect(tab.initialCommand, projectPath)
  const onPtyData = usePtyHandlers(tabId, groupId)

  // Persist the detected session ID back to the work session so
  // "Open in Claude" can resume the same session next time.
  useEffect(() => {
    if (!sessionId) return
    const ticketKey = extractTicketKey(tab.title)
    if (!ticketKey) return
    const sessionsStore = useWorkSessionsStore.getState()
    const workSession = sessionsStore.getActiveSessionForTicket(ticketKey)
    if (workSession) {
      sessionsStore.updateSession(workSession.id, { claudeSessionId: sessionId })
    }
  }, [sessionId, tab.title])

  const handleTerminalReady = useCallback((write: (data: string) => void) => {
    writeRef.current = write
    // Sync saved autopilot state to conductord on (re)connect
    if (autoPilotRef.current) {
      setAutoPilotWs(tabId, true)
    }
  }, [tabId])

  const handleSessionReady = useCallback((isNew: boolean, opts?: { autoPilot?: boolean }) => {
    // Restore autopilot state from conductord when reattaching to an existing session
    if (!isNew && opts?.autoPilot && !autoPilotRef.current) {
      setAutoPilot(true)
      updateTab(groupId, tabId, { autoPilot: true })
    }
  }, [tabId, groupId, updateTab])

  // Translate Shift+Enter → Alt+Enter (newline) in Claude's input
  const interceptKeys = useMemo(() => (e: React.KeyboardEvent, write: (data: string) => void): boolean => {
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      e.stopPropagation()
      // Send ESC + CR which is what Alt+Enter produces in a terminal
      write('\x1b\r')
      return true
    }
    return false
  }, [])

  const handleToggleBackgroundTasks = useCallback(() => {
    if (!sessionId || !writeRef.current) return
    const newValue = !disableBackgroundTasks
    setDisableBackgroundTasks(newValue)

    if (restartingRef.current) return
    restartingRef.current = true

    const write = writeRef.current
    write('\x03')
    setTimeout(() => {
      write('/exit\n')
      setTimeout(() => {
        const cmd = buildClaudeCommand(`claude --resume ${sessionId}\n`, {
          ...settings,
          disableBackgroundTasks: newValue,
        }, tab.apiKey)
        write(cmd)
        restartingRef.current = false
      }, 1500)
    }, 500)
  }, [sessionId, disableBackgroundTasks])

  const footer = (
    <>
      <Toggle on={autoPilot} onToggle={() => setAutoPilot(!autoPilot)} label="Auto-pilot" />
      <Toggle on={preventScreenClear} onToggle={() => setPreventScreenClear(!preventScreenClear)} label="Prevent clear" color="#06b6d4" />
      <Toggle
        on={disableBackgroundTasks}
        onToggle={handleToggleBackgroundTasks}
        label="No bg tasks"
        color="#ef4444"
      />
      {sessionId && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <span
            className="text-[10px] font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[220px]"
            title={sessionId}
            onClick={() => navigator.clipboard.writeText(sessionId)}
          >
            Session: {sessionId.slice(0, 8)}
          </span>
        </>
      )}
    </>
  )

  return (
    <TerminalTab
      tabId={tabId}
      groupId={groupId}
      isActive={isActive}
      tab={{
        ...tab,
        // Only transform if an initialCommand was explicitly set by the caller.
        // Restored tabs (from project file) have no initialCommand and should
        // not auto-launch claude — the process is already running in tmux.
        initialCommand: tab.initialCommand
          ? buildClaudeCommand(tab.initialCommand, settings, tab.apiKey)
          : undefined,
      }}
      preventScreenClear={preventScreenClear}
      onPtyData={onPtyData}
      onTerminalReady={handleTerminalReady}
      onSessionReady={(isNew, opts) => {
        updateTab(groupId, tabId, { hasTmuxSession: true })
        handleSessionReady(isNew, opts)
      }}
      interceptKeys={interceptKeys}
      footer={footer}
    />
  )
}
