export interface TerminalWatcher {
  id: string;
  pattern: RegExp;
  callback: (history: string) => void;
  /** Minimum ms between callback fires. Default 500. */
  debounceMs?: number;
}

export interface TerminalTabExtraProps {
  preventScreenClear?: boolean;
  watchers?: TerminalWatcher[];
  /** Called with raw PTY data (ANSI included) on every data chunk */
  onPtyData?: (data: string) => void;
  /** Called with the terminal write function so the parent can send input */
  onTerminalReady?: (write: (data: string) => void) => void;
}
