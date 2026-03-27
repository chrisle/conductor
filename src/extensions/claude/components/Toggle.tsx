import React from 'react'

interface ToggleProps {
  on: boolean
  onToggle: () => void
  label: string
  color?: string
}

export default function Toggle({ on, onToggle, label, color = '#eab308' }: ToggleProps) {
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
