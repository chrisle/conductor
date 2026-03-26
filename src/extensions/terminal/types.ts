export interface TerminalWatcher {
  id: string;
  pattern: RegExp;
  callback: (history: string) => void;
  /** Minimum ms between callback fires. Default 500. */
  debounceMs?: number;
}

export interface TerminalTabExtraProps {
  autoPilot?: boolean;
  preventScreenClear?: boolean;
  watchers?: TerminalWatcher[];
}
