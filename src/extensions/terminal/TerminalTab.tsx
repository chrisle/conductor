import React, { useEffect, useRef, useState, useCallback } from "react";
import { RotateCw } from "lucide-react";
import { init as initGhostty, Terminal, FitAddon } from "ghostty-web";
import type { TabProps } from "@/extensions/types";
import type { TerminalTabExtraProps } from "./types";
import { terminalConfig } from "./theme";
import SearchBar from "./SearchBar";
import * as termAPI from "@/lib/terminal-api";
import { useResolvedSettings } from "@/hooks/useResolvedSettings";
import { useTabsStore } from "@/store/tabs";

// Initialize ghostty WASM once
const ghosttyReady = initGhostty();

// Explicitly load the terminal fonts before the canvas renderer measures them.
// document.fonts.ready alone is insufficient: @font-face fonts that aren't
// referenced in any CSS rule aren't fetched eagerly, so measureFont() inside
// new Terminal() would fall back to the system monospace font.
const fontsReady = Promise.all([
  document.fonts.load("400 12px 'JetBrains Mono'"),
  document.fonts.load("400 12px 'Symbols Nerd Font Mono'"),
]).catch(() => {
  /* ignore load errors — terminal falls back gracefully */
});

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
}: TabProps & TerminalTabExtraProps): React.ReactElement {
  const cwd = tab.filePath;
  const initialCommand = tab.initialCommand;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isCreatedRef = useRef(false);
  const initCmdSentRef = useRef(false);
  const preventScreenClearRef = useRef(preventScreenClear);
  const userScrolledUpRef = useRef(false);
  const watchersRef = useRef(watchers);
  const onPtyDataRef = useRef(onPtyData);
  const watchLastMatchRef = useRef<Map<string, string>>(new Map());
  const watchLastFireRef = useRef<Map<string, number>>(new Map());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const resolvedSettings = useResolvedSettings();
  const sessionReadyRef = useRef(false);

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

  // Re-apply tmux mouse whenever the resolved setting changes
  useEffect(() => {
    if (sessionReadyRef.current) {
      termAPI.setTmuxOption(tabId, 'mouse', resolvedSettings.terminal.tmuxMouse ? 'on' : 'off');
    }
  }, [resolvedSettings.terminal.tmuxMouse, tabId]);

  function doFit() {
    const fitAddon = fitAddonRef.current;
    const term = terminalRef.current;
    if (!fitAddon || !term) return;
    try {
      fitAddon.fit();
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

  // --- Terminal lifecycle ---
  useEffect(() => {
    if (!containerRef.current || isCreatedRef.current) return;
    isCreatedRef.current = true;

    let disposed = false;

    Promise.all([ghosttyReady, fontsReady]).then(() => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal(terminalConfig);

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      // Hide container until PTY is ready to avoid stale buffer flash
      containerRef.current.style.visibility = "hidden";

      term.open(containerRef.current);

      setTimeout(() => {
        doFit();
        const { cols, rows } = term;
        console.log(`[terminal] ghostty fit: cols=${cols} rows=${rows}`);
        termAPI.createTerminal(tabId, cwd).then(({ isNew }) => {
          termAPI.resizeTerminal(tabId, cols, rows);
          sessionReadyRef.current = true;
          // Apply tmux mouse setting from resolved project/workspace config
          termAPI.setTmuxOption(tabId, 'mouse', resolvedSettings.terminal.tmuxMouse ? 'on' : 'off');
          // Show the terminal now that the PTY is connected and focus it
          if (containerRef.current) {
            containerRef.current.style.visibility = "visible";
          }
          term.focus();
          onTerminalReady?.((data: string) =>
            termAPI.writeTerminal(tabId, data, { programmatic: true }),
          );
          onSessionReady?.(isNew);
          // Only send initialCommand for brand-new tmux sessions. When
          // reattaching to an existing session the process is already running.
          if (initialCommand && isNew && !initCmdSentRef.current) {
            // Wait for the shell prompt to settle before sending the command.
            // We detect readiness by waiting for a gap in incoming PTY data,
            // which means the prompt has finished rendering.
            let idleTimer: ReturnType<typeof setTimeout> | null = null;
            const onData = (_event: any, id: string, _data: string) => {
              if (id !== tabId) return;
              if (idleTimer) clearTimeout(idleTimer);
              idleTimer = setTimeout(() => {
                if (initCmdSentRef.current) return;
                initCmdSentRef.current = true;
                termAPI.offTerminalData(onData);
                termAPI.writeTerminal(tabId, initialCommand, { programmatic: true });
              }, 150);
            };
            termAPI.onTerminalData(onData);
            // Fallback in case no data arrives (e.g. bare shell with no prompt)
            setTimeout(() => {
              if (initCmdSentRef.current) return;
              initCmdSentRef.current = true;
              termAPI.offTerminalData(onData);
              if (idleTimer) clearTimeout(idleTimer);
              termAPI.writeTerminal(tabId, initialCommand, { programmatic: true });
            }, 3000);
          }
        });
      }, 50);

      term.onData((data: string) => {
        termAPI.writeTerminal(tabId, data);
        userScrolledUpRef.current = false;
      });

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        console.log(`[terminal] ghostty resize: cols=${cols} rows=${rows}`);
        termAPI.resizeTerminal(tabId, cols, rows);
      });

      term.onRender(({ start, end }: { start: number; end: number }) => {
        processWatchers(term, start, end);
      });

      // Track user scroll-up via wheel events.
      // We set the flag immediately on scroll-up and clear it only when
      // the user actively scrolls back to the bottom (no timeout race).
      const el = containerRef.current;
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          userScrolledUpRef.current = true;
        } else if (e.deltaY > 0) {
          // Check synchronously after Ghostty processes the scroll
          requestAnimationFrame(() => {
            if (disposed) return;
            const buf = term.buffer.active;
            if (buf.viewportY >= buf.baseY) {
              userScrolledUpRef.current = false;
            }
          });
        }
      };
      el?.addEventListener("wheel", onWheel);

      let needsRefitAfterFirstData = true;

      const handleTerminalData = (_event: any, id: string, data: string) => {
        if (id !== tabId || disposed) return;

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

        // Snapshot viewport position before write — term.write() can
        // move the viewport on its own in some cases.
        const buf = term.buffer.active;
        const wasAtBottom = buf.viewportY >= buf.baseY;

        term.write(data);

        if (!userScrolledUpRef.current && wasAtBottom) {
          term.scrollToBottom();
        }

        // Notify parent extension of raw PTY data
        onPtyDataRef.current?.(data);
      };

      const handleTerminalExit = (_event: any, id: string) => {
        if (id === tabId) term.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      };

      termAPI.onTerminalData(handleTerminalData);
      termAPI.onTerminalExit(handleTerminalExit);

      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            const el = containerRef.current;
            if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return;
            doFit();
            if (!userScrolledUpRef.current) {
              terminalRef.current?.scrollToBottom();
            }
          } catch {}
        }, 100);
      });
      if (wrapperRef.current) resizeObserver.observe(wrapperRef.current);

      cleanupRef.current = () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        termAPI.offTerminalData(handleTerminalData);
        termAPI.offTerminalExit(handleTerminalExit);
        el?.removeEventListener("wheel", onWheel);
        resizeObserver.disconnect();
        watchLastMatchRef.current.clear();
        watchLastFireRef.current.clear();
        term.dispose();
      };
    });

    const cleanupRef = { current: () => {} };

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
      setTimeout(() => {
        terminalRef.current?.focus();
        fitAndScroll();
      }, 50);
      setTimeout(fitAndScroll, 200);
    } else if (!isActive && terminalRef.current) {
      terminalRef.current.blur();
    }
  }, [isActive]);

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-zinc-950">
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
        if (interceptKeys?.(e, (data) => termAPI.writeTerminal(tabId, data))) {
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
      <div
        ref={containerRef}
        className="h-full w-full min-w-0 overflow-hidden"
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
    </div>
    <div className="flex items-center gap-3 px-2 h-5 border-t border-zinc-800 shrink-0">
      {footer}
      <div className="flex-1" />
      <button
        onClick={handleRefresh}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Refresh terminal"
      >
        <RotateCw className="w-3 h-3" />
      </button>
      <span
        className="text-[10px] font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[180px]"
        title={tabId}
        onClick={() => navigator.clipboard.writeText(tabId)}
      >
        tmux: {tabId}
      </span>
    </div>
</div>
  );
}
