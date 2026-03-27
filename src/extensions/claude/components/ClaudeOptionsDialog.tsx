import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { useClaudeSettings } from '../contexts/useClaudeSettings'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ClaudeOptionsDialog({ open, onClose }: Props): React.ReactElement {
  const { skipDangerousPermissions, autoPilotScanMs, disableBackgroundTasks, update } =
    useClaudeSettings()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-zinc-200 w-80">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-zinc-100">Claude Options</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-1">
          {/* Skip dangerous permissions */}
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

          {/* Auto-pilot scan time */}
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

          {/* Disable background tasks */}
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
      </DialogContent>
    </Dialog>
  )
}
