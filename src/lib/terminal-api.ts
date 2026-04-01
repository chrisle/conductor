/**
 * Terminal API accessor.
 *
 * Always routes through conductord WebSocket (terminal-ws) so that terminal
 * sessions survive window reloads in both Electron and web modes.
 *
 * Import this instead of reaching for window.electronAPI.{terminal methods}.
 */
export {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  setAutoPilot,
  setTmuxOption,
  capturePane,
  onTerminalData,
  offTerminalData,
  onTerminalExit,
  offTerminalExit,
} from './terminal-ws'
