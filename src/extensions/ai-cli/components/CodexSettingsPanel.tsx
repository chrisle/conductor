import React from 'react'
import { useCodexSettings } from '../contexts/useCodexSettings'

export default function CodexSettingsPanel(): React.ReactElement {
  const codex = useCodexSettings()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider">Codex</div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Auto-pilot scan interval</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              How often PTY output is scanned (ms)
            </div>
          </div>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={codex.autoPilotScanMs}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v >= 50) codex.update({ autoPilotScanMs: v })
            }}
            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-base text-zinc-200 text-right focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>
    </div>
  )
}
