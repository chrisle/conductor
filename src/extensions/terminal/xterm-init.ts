import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { terminalConfig, terminalColors } from './theme'

export type { Terminal, FitAddon }

// Inject once: make xterm fill its container instead of sizing to row count
let styleInjected = false
function injectXtermStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    .xterm {
      height: 100%;
      letter-spacing: normal !important;
      line-height: normal !important;
    }
    .xterm * {
      letter-spacing: normal !important;
    }
    .xterm .xterm-char-measure-element,
    .xterm .xterm-rows,
    .xterm .xterm-helper-textarea {
      letter-spacing: normal !important;
      line-height: normal !important;
    }
    .xterm-viewport {
      background-color: transparent !important;
    }
  `
  document.head.appendChild(style)
}

export async function createXtermTerminal(container: HTMLElement): Promise<{ term: Terminal; fitAddon: FitAddon }> {
  injectXtermStyles()

  const term = new Terminal({
    theme: terminalColors,
    fontFamily: terminalConfig.fontFamily,
    fontSize: terminalConfig.fontSize,
    cursorBlink: terminalConfig.cursorBlink,
    cursorStyle: terminalConfig.cursorStyle,
    scrollback: terminalConfig.scrollback,
    allowTransparency: true,
  })

  const fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(container)

  return { term, fitAddon }
}
