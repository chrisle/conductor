export const terminalColors = {
  background: "#09090b",
  foreground: "#e4e4e7",
  cursor: "#a1a1aa",
  cursorAccent: "#09090b",
  selectionBackground: "#3f3f46",
  black: "#18181b",
  brightBlack: "#3f3f46",
  red: "#ef4444",
  brightRed: "#f87171",
  green: "#22c55e",
  brightGreen: "#4ade80",
  yellow: "#eab308",
  brightYellow: "#facc15",
  blue: "#3b82f6",
  brightBlue: "#60a5fa",
  magenta: "#a855f7",
  brightMagenta: "#c084fc",
  cyan: "#06b6d4",
  brightCyan: "#22d3ee",
  white: "#d4d4d8",
  brightWhite: "#f4f4f5",
};

export const terminalConfig = {
  theme: terminalColors,
  fontFamily: "'FiraCode Nerd Font Mono', monospace",
  get fontSize() {
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ui-text-sm').trim(), 10) || 12
  },
  lineHeight: 1.0,
  cursorBlink: true,
  cursorStyle: "block" as const,
  scrollback: 100000,
  devicePixelRatio: window.devicePixelRatio || 2,
};
