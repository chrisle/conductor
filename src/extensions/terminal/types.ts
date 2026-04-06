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
  /** Called once the PTY session is established; isNew=false means an existing session was reattached */
  onSessionReady?: (isNew: boolean, opts?: { autoPilot?: boolean }) => void;
  /** Intercept key events before the terminal processes them. Return true to prevent default handling. */
  interceptKeys?: (e: React.KeyboardEvent, write: (data: string) => void) => boolean;
  /** Optional content rendered on the left side of the toolbar (before the spacer) */
  footerLeft?: React.ReactNode;
  /** Optional footer rendered on the right side of the toolbar (after the spacer) */
  footer?: React.ReactNode;
  /** Where to render the footer bar — 'top' (default) or 'bottom' */
  footerPosition?: 'top' | 'bottom';
}
