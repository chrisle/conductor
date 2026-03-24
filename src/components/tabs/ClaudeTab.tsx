import React, { useState } from 'react'
import { Switch } from '@/components/ui/switch'
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
        />
      </div>

      <div className="flex items-center gap-2 px-3 h-7 border-t border-zinc-800 shrink-0">
        <Switch
          id="autopilot"
          checked={autoPilot}
          onCheckedChange={setAutoPilot}
          className="h-4 w-7 data-[state=checked]:bg-yellow-500"
        />
        <label
          htmlFor="autopilot"
          className="text-xs font-mono cursor-pointer select-none"
          style={{ color: autoPilot ? '#eab308' : '#71717a' }}
        >
          Auto-pilot
        </label>
      </div>
    </div>
  )
}
