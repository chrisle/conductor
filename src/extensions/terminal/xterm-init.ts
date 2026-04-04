import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { terminalConfig, terminalColorThemes } from './theme'
import { useConfigStore } from '@/store/config'
import type { TerminalCustomization } from '@/types/app-config'

export type { Terminal, FitAddon, SerializeAddon }

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

function getTerminalCustomization(): TerminalCustomization {
  return useConfigStore.getState().config.customization.terminal
}

export async function createXtermTerminal(container: HTMLElement): Promise<{ term: Terminal; fitAddon: FitAddon; serializeAddon: SerializeAddon }> {
  injectXtermStyles()

  const custom = getTerminalCustomization()
  const theme = terminalColorThemes[custom.colorTheme] ?? terminalColorThemes.default

  const term = new Terminal({
    theme,
    fontFamily: custom.fontFamily || terminalConfig.fontFamily,
    fontSize: custom.fontSize || terminalConfig.fontSize,
    lineHeight: custom.lineHeight || terminalConfig.lineHeight,
    cursorBlink: custom.cursorBlink ?? terminalConfig.cursorBlink,
    cursorStyle: custom.cursorStyle || terminalConfig.cursorStyle,
    scrollback: terminalConfig.scrollback,
    allowTransparency: true,
  })

  const fitAddon = new FitAddon()
  const serializeAddon = new SerializeAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(serializeAddon)
  term.open(container)

  try {
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon.dispose()
    })
    term.loadAddon(webglAddon)
  } catch {
    // WebGL not available, fall back to default canvas renderer
  }

  return { term, fitAddon, serializeAddon }
}
