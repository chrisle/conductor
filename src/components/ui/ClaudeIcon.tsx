import React from 'react'

// Claude logomark — radiating elongated ovals (Anthropic's Claude icon)
export default function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(12,12)">
        {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle, i) => (
          <ellipse
            key={i}
            cx="0"
            cy="-4.2"
            rx="1.15"
            ry="3.2"
            transform={`rotate(${angle})`}
            opacity={0.55 + i * 0.05}
          />
        ))}
      </g>
    </svg>
  )
}
