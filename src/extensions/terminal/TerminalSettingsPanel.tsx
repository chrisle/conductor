import React from 'react'
import { useTerminalSettings, type TerminalRenderer } from './useTerminalSettings'

const options: { value: TerminalRenderer; label: string; description: string }[] = [
  { value: 'ghostty', label: 'Ghostty', description: 'GPU-accelerated via WebAssembly' },
  { value: 'xterm', label: 'xterm.js', description: 'Canvas-based, broad compatibility' },
]

export default function TerminalSettingsPanel(): React.ReactElement {
  const { renderer, update } = useTerminalSettings()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-zinc-200">Renderer</div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Terminal rendering backend (restart tab to apply)
          </div>
        </div>
        <select
          value={renderer}
          onChange={e => update({ renderer: e.target.value as TerminalRenderer })}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
