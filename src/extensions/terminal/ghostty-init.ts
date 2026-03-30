import { init as initGhostty, Terminal, FitAddon } from 'ghostty-web'
import { terminalConfig } from './theme'

export type { Terminal, FitAddon }

// Initialize ghostty WASM once
const ghosttyReady = initGhostty()

// Explicitly load the terminal fonts before the canvas renderer measures them.
const fontsReady = Promise.all([
  document.fonts.load("400 12px 'JetBrains Mono'"),
  document.fonts.load("400 12px 'Symbols Nerd Font Mono'"),
]).catch(() => {
  /* ignore load errors — terminal falls back gracefully */
})

export async function createGhosttyTerminal(container: HTMLElement): Promise<{ term: Terminal; fitAddon: FitAddon }> {
  await Promise.all([ghosttyReady, fontsReady])

  const term = new Terminal(terminalConfig)
  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(container)

  return { term, fitAddon }
}
