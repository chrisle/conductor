import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { TabProps } from '@/extensions/types'
import TerminalTab from '../../terminal/TerminalTab'
import Toggle from './Toggle'
import { usePtyHandlers } from '../pty-handlers/usePtyHandlers'
import { useCodexSettings } from '../contexts/useCodexSettings'
import { buildCodexCommand } from '../contexts/buildCodexCommand'
import { setAutoPilot as setAutoPilotWs } from '@/lib/terminal-api'
import { useTabsStore } from '@/store/tabs'

export default function CodexTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const settings = useCodexSettings()
  const [autoPilot, setAutoPilot] = useState(tab.autoPilot ?? false)
  const { updateTab } = useTabsStore()
  const autoPilotRef = useRef(autoPilot)
  const writeRef = useRef<((data: string) => void) | null>(null)

  useEffect(() => { autoPilotRef.current = autoPilot }, [autoPilot])

  // Sync autopilot state to conductord whenever it changes
  useEffect(() => {
    setAutoPilotWs(tabId, autoPilot)
  }, [autoPilot, tabId])

  const onPtyData = usePtyHandlers(tabId, groupId)

  const handleTerminalReady = useCallback((write: (data: string) => void) => {
    writeRef.current = write
    if (autoPilotRef.current) {
      setAutoPilotWs(tabId, true)
    }
  }, [tabId])

  // Translate Shift+Enter → Alt+Enter (newline) in Codex's input
  const interceptKeys = useMemo(() => (e: React.KeyboardEvent, write: (data: string) => void): boolean => {
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      e.stopPropagation()
      write('\x1b\r')
      return true
    }
    return false
  }, [])

  const footer = (
    <>
      <Toggle on={autoPilot} onToggle={() => setAutoPilot(!autoPilot)} label="Auto-pilot" />
    </>
  )

  return (
    <TerminalTab
      tabId={tabId}
      groupId={groupId}
      isActive={isActive}
      tab={{
        ...tab,
        initialCommand: tab.initialCommand
          ? buildCodexCommand(tab.initialCommand, settings)
          : undefined,
      }}
      onPtyData={onPtyData}
      onTerminalReady={handleTerminalReady}
      onSessionReady={() => updateTab(groupId, tabId, { hasTmuxSession: true })}
      interceptKeys={interceptKeys}
      footer={footer}
    />
  )
}
