import React, { useEffect, useRef, useState, useCallback } from "react";
import { RotateCw } from "lucide-react";
import type { TabProps } from "@/extensions/types";
import type { TerminalTabExtraProps } from "./types";
import SearchBar from "./SearchBar";
import * as termAPI from "@/lib/terminal-api";
import { useTabsStore } from "@/store/tabs";
import { createXtermTerminal } from "./xterm-init";
import type { Terminal, SerializeAddon } from "./xterm-init";
import { terminalConfig } from "./theme";

export type { TerminalWatcher, TerminalTabExtraProps } from "./types";

export default function TerminalTab({
  tabId,
  groupId,
  isActive,
  tab,
  preventScreenClear = false,
  watchers,
  onPtyData,
  onTerminalReady,
  onSessionReady,
  interceptKeys,
  footer,
  footerPosition = 'top',
}: TabProps & TerminalTabExtraProps): React.ReactElement {
  const cwd = tab.filePath;
  const initialCommand = tab.initialCommand;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const serializeAddonRef = useRef<any>(null);
  const isCreatedRef = useRef(false);
  const initCmdSentRef = useRef(false);
  const preventScreenClearRef = useRef(preventScreenClear);
  const userScrolledUpRef = useRef(false);
  const watchersRef = useRef(watchers);
  const onPtyDataRef = useRef(onPtyData);
  const watchLastMatchRef = useRef<Map<string, string>>(new Map());
  const watchLastFireRef = useRef<Map<string, number>>(new Map());
  const pendingDataRef = useRef<string[]>([]);
  const pendingExitRef = useRef(false);
  const mountGenerationRef = useRef(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error' | null>('connecting');
  const hydratingRef = useRef(false);

  const handleRefresh = useCallback(() => {
    termAPI.killTerminal(tabId);
    useTabsStore.getState().updateTab(groupId, tabId, {
      refreshKey: (tab.refreshKey || 0) + 1,
    });
  }, [tabId, groupId, tab.refreshKey]);

  useEffect(() => {
    preventScreenClearRef.current = preventScreenClear;
  }, [preventScreenClear]);
  useEffect(() => {
    watchersRef.current = watchers;
  }, [watchers]);
  useEffect(() => {
    onPtyDataRef.current = onPtyData;
  }, [onPtyData]);

  function doFit() {
    const fitAddon = fitAddonRef.current;
    const term = terminalRef.current;
    if (!fitAddon || !term) return;
    const el = containerRef.current;
    if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return;
    try {
      fitAddon.fit();
      // Skip degenerate dimensions that occur during layout transitions
      if (term.cols <= 1 || term.rows <= 1) return;
      // Always sync PTY dimensions after fit, even if cols/rows didn't change
      // from the terminal's perspective (onResize won't fire in that case)
      termAPI.resizeTerminal(tabId, term.cols, term.rows);
    } catch {}
  }

  function searchBuffer(query: string, direction: "next" | "previous") {
    const term = terminalRef.current;
    if (!term || !query) return;
    const buf = term.buffer.active;
    let fullText = "";
    const lineStarts: number[] = [];
    for (let i = 0; i <= buf.baseY + term.rows - 1; i++) {
      lineStarts.push(fullText.length);
      const line = buf.getLine(i);
      if (line) fullText += line.translateToString(true) + "\n";
    }
    const lower = fullText.toLowerCase();
    const needle = query.toLowerCase();
    const idx =
      direction === "next" ? lower.indexOf(needle) : lower.lastIndexOf(needle);
    if (idx >= 0) {
      let matchLine = 0;
      for (let i = 0; i < lineStarts.length; i++) {
        if (lineStarts[i] > idx) break;
        matchLine = i;
      }
      term.scrollToLine(matchLine);
    }
  }

  function writePtyData(term: any, data: string) {
    const afterWrite = () => {
      if (!userScrolledUpRef.current) {
        term.scrollToBottom();
      }
    };

    // xterm.js supports a callback that fires once the chunk has been parsed.
    // Use it so we scroll after the buffer has actually advanced, not before.
    if (typeof term.write === "function" && term.write.length >= 2) {
      term.write(data, afterWrite);
      return;
    }

    term.write(data);
    requestAnimationFrame(afterWrite);
  }

  // --- Terminal lifecycle ---
  useEffect(() => {
    if (!containerRef.current || isCreatedRef.current) return;
    isCreatedRef.current = true;

    const containerEl = containerRef.current;
    const mountGeneration = ++mountGenerationRef.current;
    let disposed = false;
    const cleanupRef = { current: () => {} };

    const createTerminal = createXtermTerminal;
    const clearContainer = () => {
      if (mountGenerationRef.current !== mountGeneration) return;
      containerEl.replaceChildren();
      containerEl.style.visibility = "visible";
    };

    const flushPendingData = () => {
      const term = terminalRef.current;
      if (!term || pendingDataRef.current.length === 0) return;

      if (needsRefitAfterFirstData) {
        needsRefitAfterFirstData = false;
        setTimeout(() => doFit(), 100);
      }

      const chunks = pendingDataRef.current;
      pendingDataRef.current = [];
      for (let data of chunks) {
        if (preventScreenClearRef.current) {
          data = data
            .replace(/\x1b\[2J/g, "")
            .replace(/\x1b\[3J/g, "")
            .replace(/\x1bc/g, "");
          if (!data) continue;
        }
        writePtyData(term, data);
        onPtyDataRef.current?.(data);
      }
    };

    const handleTerminalData = (_event: any, id: string, data: string) => {
      if (id !== tabId || disposed) return;

      const term = terminalRef.current;
      if (!term || hydratingRef.current) {
        pendingDataRef.current.push(data);
        return;
      }

      if (needsRefitAfterFirstData) {
        needsRefitAfterFirstData = false;
        setTimeout(() => doFit(), 100);
      }

      if (preventScreenClearRef.current) {
        data = data
          .replace(/\x1b\[2J/g, "")
          .replace(/\x1b\[3J/g, "")
          .replace(/\x1bc/g, "");
        if (!data) return;
      }

      writePtyData(term, data);

      // Notify parent extension of raw PTY data
      onPtyDataRef.current?.(data);
    };

    const handleTerminalExit = (_event: any, id: string) => {
      if (id !== tabId || disposed) return;

      const term = terminalRef.current;
      if (!term) {
        pendingExitRef.current = true;
        return;
      }

      term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
    };

    termAPI.onTerminalData(handleTerminalData);
    termAPI.onTerminalExit(handleTerminalExit);
    cleanupRef.current = () => {
      termAPI.offTerminalData(handleTerminalData);
      termAPI.offTerminalExit(handleTerminalExit);
      clearContainer();
    };

    let needsRefitAfterFirstData = true;

    clearContainer();
    createTerminal(containerEl).then(({ term, fitAddon, serializeAddon }) => {
      if (disposed) {
        term.dispose();
        return;
      }

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;
      serializeAddonRef.current = serializeAddon;
      flushPendingData();
      if (pendingExitRef.current) {
        pendingExitRef.current = false;
        term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      }

      // Hide container until PTY is ready to avoid stale buffer flash
      containerEl.style.visibility = "hidden";

      setTimeout(() => {
        doFit();
        const { cols, rows } = term;
        console.log(`[terminal] xterm fit: cols=${cols} rows=${rows}`);
        // Pass the initialCommand to conductord so it runs the command
        // immediately after creating the session — far more reliable than
        // waiting for the shell prompt from the renderer side.
        termAPI.createTerminal(tabId, cwd, initialCommand).then(async ({ isNew, autoPilot: apState }) => {
          console.log(`[terminal] session ready: id=${tabId} isNew=${isNew} autoPilot=${apState} hasInitCmd=${!!initialCommand}`);
          termAPI.resizeTerminal(tabId, cols, rows);

          // For existing sessions, suppress live PTY data while we hydrate
          // the scrollback buffer to avoid doubling the visible screen content.
          if (!isNew) {
            hydratingRef.current = true;
          }

          if (disposed) return;
          setConnectionStatus('connected');

          if (!isNew) {
            // Restore scrollback from serialized buffer (saved on previous
            // teardown) so colors and formatting are preserved exactly.
            const saved = sessionStorage.getItem(`terminal:buffer:${tabId}`);
            if (saved && !disposed) {
              term.write(saved, () => {
                if (disposed) return;
                containerEl.style.visibility = "visible";
                term.focus();
                term.scrollToBottom();
                hydratingRef.current = false;
                flushPendingData();
              });
            } else {
              // No saved buffer — show terminal and resume immediately
              containerEl.style.visibility = "visible";
              term.focus();
              hydratingRef.current = false;
              flushPendingData();
            }
            setTimeout(() => doFit(), 100);
          } else {
            // For new sessions: show immediately, fit after visible
            containerEl.style.visibility = "visible";
            term.focus();
            setTimeout(() => doFit(), 100);
          }
          onTerminalReady?.((data: string) =>
            termAPI.writeTerminal(tabId, data, { programmatic: true }),
          );
          onSessionReady?.(isNew, { autoPilot: apState });
          // Mark initialCommand as sent — conductord already ran it
          // when creating the session.
          if (initialCommand && isNew) {
            initCmdSentRef.current = true;
          }
        }).catch((err) => {
          console.error(`[terminal] failed to create session ${tabId}:`, err);
          setConnectionStatus('error');
          containerEl.style.visibility = "visible";
        });
      }, 50);

      term.onData((data: string) => {
        termAPI.writeTerminal(tabId, data);
        userScrolledUpRef.current = false;
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        console.log(`[terminal] resize: cols=${cols} rows=${rows}`);
        termAPI.resizeTerminal(tabId, cols, rows);
      });

      term.onRender(({ start, end }: { start: number; end: number }) => {
        processWatchers(term, start, end);
      });

      // Track whether user scrolled up so we don't auto-scroll on new data.
      const el = containerRef.current;
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          userScrolledUpRef.current = true;
        } else if (e.deltaY > 0) {
          requestAnimationFrame(() => {
            if (disposed) return;
            const buf = term.buffer.active;
            if (buf.viewportY >= buf.baseY) {
              userScrolledUpRef.current = false;
            }
          });
        }
      };
      el?.addEventListener("wheel", onWheel, { capture: true });

      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const scheduleRefit = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            doFit();
            if (!userScrolledUpRef.current) {
              terminalRef.current?.scrollToBottom();
            }
          } catch {}
        }, 100);
      };
      const resizeObserver = new ResizeObserver(scheduleRefit);
      if (wrapperRef.current) resizeObserver.observe(wrapperRef.current);

      // Fallback: window resize events catch cases ResizeObserver misses
      // (e.g. Electron window maximize/unmaximize, fullscreen transitions)
      const onWindowResize = () => scheduleRefit();
      window.addEventListener("resize", onWindowResize);

      cleanupRef.current = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        window.removeEventListener("resize", onWindowResize);
        termAPI.offTerminalData(handleTerminalData);
        termAPI.offTerminalExit(handleTerminalExit);
        el?.removeEventListener("wheel", onWheel, { capture: true });
        resizeObserver.disconnect();
        watchLastMatchRef.current.clear();
        watchLastFireRef.current.clear();
        // Serialize the buffer with colors before disposing so it can
        // be restored on reattach (same approach as VS Code).
        try {
          if (serializeAddonRef.current) {
            const serialized = serializeAddonRef.current.serialize({
              scrollback: terminalConfig.scrollback,
            });
            sessionStorage.setItem(`terminal:buffer:${tabId}`, serialized);
          }
        } catch (err) {
          console.warn('[terminal] failed to serialize buffer:', err);
        }
        term.dispose();
        clearContainer();
      };
    }).catch((err) => {
      termAPI.offTerminalData(handleTerminalData);
      termAPI.offTerminalExit(handleTerminalExit);
      clearContainer();
      console.error(`[terminal] failed to initialize renderer for ${tabId}:`, err);
      setConnectionStatus('error');
    });

    return () => {
      disposed = true;
      isCreatedRef.current = false;
      cleanupRef.current();
    };
  }, [tabId]);

  // --- Watcher system ---
  function processWatchers(term: Terminal, start: number, end: number) {
    if (!watchersRef.current || watchersRef.current.length === 0) return;

    const buf = term.buffer.active;
    let renderedText = "";
    for (let i = start; i <= end; i++) {
      const line = buf.getLine(buf.baseY + i);
      if (line) renderedText += line.translateToString(true) + "\n";
    }

    for (const watcher of watchersRef.current) {
      if (watcher.pattern.global) watcher.pattern.lastIndex = 0;
      const match = watcher.pattern.exec(renderedText);
      if (!match) continue;

      const matchStr = match[0];
      if (watchLastMatchRef.current.get(watcher.id) === matchStr) continue;

      const now = Date.now();
      const cooldown = watcher.debounceMs ?? 500;
      const lastFire = watchLastFireRef.current.get(watcher.id) ?? 0;
      if (now - lastFire < cooldown) continue;

      watchLastMatchRef.current.set(watcher.id, matchStr);
      watchLastFireRef.current.set(watcher.id, now);

      let history = "";
      for (let i = 0; i <= buf.baseY + term.rows - 1; i++) {
        const line = buf.getLine(i);
        if (line) history += line.translateToString(true) + "\n";
      }
      watcher.callback(history);
    }
  }

  // --- Focus / fit on tab activation ---
  useEffect(() => {
    if (isActive && terminalRef.current) {
      const fitAndScroll = () => {
        const el = containerRef.current;
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          doFit();
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom();
          }
        }
      };
      // Use rAF to wait for the browser to finish layout after the hidden
      // class is removed, then fit. The 50ms / 200ms fallbacks catch cases
      // where a single frame isn't enough (e.g. complex split resizes).
      requestAnimationFrame(() => {
        terminalRef.current?.focus();
        fitAndScroll();
      });
      setTimeout(fitAndScroll, 100);
      setTimeout(fitAndScroll, 300);
    } else if (!isActive && terminalRef.current) {
      terminalRef.current.blur();
    }
  }, [isActive]);

  const toolbar = (
    <div className={`flex items-center gap-3 px-2 h-5 shrink-0 ${footerPosition === 'bottom' ? 'border-t border-zinc-800' : 'border-b border-zinc-800'}`}>
      {footerPosition !== 'bottom' && footer}
      <div className="flex-1" />
      <button
        onClick={handleRefresh}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Refresh terminal"
      >
        <RotateCw className="w-3 h-3" />
      </button>
      <span
        className="text-ui-xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[180px]"
        title={tabId}
        onClick={() => navigator.clipboard.writeText(tabId)}
      >
        session: {tabId}
      </span>
      {footerPosition === 'bottom' && footer}
    </div>
  )

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-zinc-950">
    {footerPosition !== 'bottom' && toolbar}
    <div className="flex-1 min-h-0">
    <div
      ref={wrapperRef}
      className="relative m-3 min-w-0"
      style={{ width: 'calc(100% - 1.5rem)', height: 'calc(100% - 1.5rem)' }}
      onKeyDownCapture={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          e.stopPropagation();
          setShowSearch(true);
        }
        // Allow extensions to intercept keys (e.g. Shift+Enter → Alt+Enter)
        if (interceptKeys?.(e, (data: string) => termAPI.writeTerminal(tabId, data))) {
          return;
        }
        // Prevent browser from using Tab/Shift+Tab for focus navigation;
        // forward them as terminal escape sequences instead.
        if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          termAPI.writeTerminal(tabId, e.shiftKey ? "\x1b[Z" : "\t");
        }
      }}
    >
      {showSearch && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSearch={(dir) => searchBuffer(searchQuery, dir)}
          onClose={() => {
            setShowSearch(false);
            terminalRef.current?.focus();
          }}
        />
      )}
      {connectionStatus !== 'connected' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          {connectionStatus === 'connecting' && (
            <div className="flex items-center gap-2 text-zinc-500 text-ui-base">
              <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
              Connecting to conductord...
            </div>
          )}
          {connectionStatus === 'error' && (
            <div className="flex flex-col items-center gap-2 pointer-events-auto">
              <span className="text-red-400 text-ui-base">Failed to connect to conductord</span>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 text-ui-sm text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded border border-zinc-700 hover:border-zinc-600 transition-colors"
              >
                <RotateCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full min-w-0 overflow-hidden"
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
    </div>
    {footerPosition === 'bottom' && toolbar}
</div>
  );
}
