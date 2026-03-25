import React, { useState, useCallback } from 'react'
import { useTabsStore } from '@/store/tabs'
import TerminalTab from './TerminalTab'

interface ClaudeTabProps {
  tabId: string
  groupId: string
  isActive: boolean
  cwd?: string
  initialCommand?: string
}

export default function ClaudeTab({ tabId, groupId, isActive, cwd, initialCommand }: ClaudeTabProps): React.ReactElement {
  const [autoPilot, setAutoPilot] = useState(false)
  const updateTab = useTabsStore(s => s.updateTab)

  const handleThinkingChange = useCallback((thinking: boolean) => {
    updateTab(groupId, tabId, { isThinking: thinking })
  }, [groupId, tabId, updateTab])

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      <div className="flex-1 min-h-0">
        <TerminalTab
          tabId={tabId}
          groupId={groupId}
          isActive={isActive}
          cwd={cwd}
          initialCommand={initialCommand || "claude\n"}
          autoPilot={autoPilot}
          onThinkingChange={handleThinkingChange}
        />
      </div>

      <div className="flex items-center gap-1.5 px-2 h-5 border-t border-zinc-800 shrink-0">
        <button
          onClick={() => setAutoPilot(!autoPilot)}
          className="relative inline-flex h-3 w-5 shrink-0 cursor-pointer items-center rounded-full transition-colors"
          style={{ backgroundColor: autoPilot ? '#eab308' : '#3f3f46' }}
        >
          <span
            className="block h-2 w-2 rounded-full bg-white shadow transition-transform"
            style={{ transform: autoPilot ? 'translateX(10px)' : 'translateX(2px)' }}
          />
        </button>
        <label
          onClick={() => setAutoPilot(!autoPilot)}
          className="text-[10px] cursor-pointer select-none leading-none"
          style={{ color: autoPilot ? '#eab308' : '#52525b' }}
        >
          Auto-pilot
        </label>
      </div>
    </div>
  )
}
