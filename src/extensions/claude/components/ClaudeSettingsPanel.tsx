import React from 'react'
import { Switch } from '@/components/ui/switch'
import { useClaudeSettings } from '../contexts/useClaudeSettings'

export default function ClaudeSettingsPanel(): React.ReactElement {
  const { skipDangerousPermissions, autoPilotScanMs, disableBackgroundTasks, update } =
    useClaudeSettings()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-zinc-200">Skip dangerous permissions</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Passes --dangerously-skip-permissions to claude
          </div>
        </div>
        <Switch
          checked={skipDangerousPermissions}
          onCheckedChange={(v) => update({ skipDangerousPermissions: v })}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-zinc-200">Auto-pilot scan interval</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            How often PTY output is scanned (ms)
          </div>
        </div>
        <input
          type="number"
          min={50}
          max={5000}
          step={50}
          value={autoPilotScanMs}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v >= 50) update({ autoPilotScanMs: v })
          }}
          className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-right focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-zinc-200">Disable background tasks</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Default for new Claude tabs
          </div>
        </div>
        <Switch
          checked={disableBackgroundTasks}
          onCheckedChange={(v) => update({ disableBackgroundTasks: v })}
        />
      </div>
    </div>
  )
}
