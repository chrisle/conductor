import React, { useEffect, useRef, useState } from "react";
import { init as initGhostty, Terminal, FitAddon } from "ghostty-web";
import { AUTOPILOT_RULES, stripAnsi } from "@/lib/terminal-detection";
import type { TabProps } from "@/extensions/types";
import type { TerminalTabExtraProps } from "./types";
import { terminalConfig } from "./theme";
import SearchBar from "./SearchBar";
import * as termAPI from "@/lib/terminal-api";

// Initialize ghostty WASM once
const ghosttyReady = initGhostty();

// Ensure bundled fonts are loaded before measuring
const fontsReady = document.fonts.ready;

export type { TerminalWatcher, TerminalTabExtraProps } from "./types";

export default function TerminalTab({
  tabId,
  isActive,
  tab,
  autoPilot = false,
  preventScreenClear = false,
  watchers,
}: TabProps & TerminalTabExtraProps): React.ReactElement {
  const cwd = tab.filePath;
  const initialCommand = tab.initialCommand;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isCreatedRef = useRef(false);
  const initCmdSentRef = useRef(false);
  const autoPilotRef = useRef(autoPilot);
  const preventScreenClearRef = useRef(preventScreenClear);
  const respondedBufRef = useRef("");
  const userScrolledUpRef = useRef(false);
  const watchersRef = useRef(watchers);
  const watchLastMatchRef = useRef<Map<string, string>>(new Map());
  const watchLastFireRef = useRef<Map<string, number>>(new Map());
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    autoPilotRef.current = autoPilot;
  }, [autoPilot]);
  useEffect(() => {
    preventScreenClearRef.current = preventScreenClear;
  }, [preventScreenClear]);
  useEffect(() => {
    watchersRef.current = watchers;
  }, [watchers]);

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
        termAPI.createTerminal(tabId, cwd).then(() => {
          termAPI.resizeTerminal(tabId, cols, rows);
          // Show the terminal now that the PTY is connected
          if (containerRef.current) {
            containerRef.current.style.visibility = "visible";
          }
          if (initialCommand && !initCmdSentRef.current) {
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
                termAPI.writeTerminal(tabId, initialCommand);
              }, 150);
            };
            termAPI.onTerminalData(onData);
            // Fallback in case no data arrives (e.g. bare shell with no prompt)
            setTimeout(() => {
              if (initCmdSentRef.current) return;
              initCmdSentRef.current = true;
              termAPI.offTerminalData(onData);
              if (idleTimer) clearTimeout(idleTimer);
              termAPI.writeTerminal(tabId, initialCommand);
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

      // Track user scroll-up via wheel events only
      const el = containerRef.current;
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          userScrolledUpRef.current = true;
        } else {
          setTimeout(() => {
            if (disposed) return;
            const buf = term.buffer.active;
            if (buf.viewportY >= buf.baseY) {
              userScrolledUpRef.current = false;
            }
          }, 50);
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

        term.write(data);

        if (!userScrolledUpRef.current) {
          term.scrollToBottom();
        }

        processAutoPilot(term);
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

  // --- Autopilot ---
  function processAutoPilot(term: Terminal) {
    if (!autoPilotRef.current) return;

    setTimeout(() => {
      const buf = term.buffer.active;
      let screenText = "";
      for (let i = 0; i < term.rows; i++) {
        const line = buf.getLine(buf.baseY + i);
        if (line) screenText += line.translateToString(true) + "\n";
      }

      // Strip ANSI codes so regex patterns match cleanly
      const cleaned = stripAnsi(screenText);

      for (const rule of AUTOPILOT_RULES) {
        if (!rule.pattern.test(cleaned)) continue;

        const screenKey = cleaned.trim().slice(-120);
        if (respondedBufRef.current === screenKey) continue;
        respondedBufRef.current = screenKey;
        setTimeout(
          () => termAPI.writeTerminal(tabId, rule.response),
          150,
        );
        break;
      }
    }, 50);
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
    }
  }, [isActive]);

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full min-w-0 bg-zinc-950 relative p-2"
      onKeyDownCapture={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          e.stopPropagation();
          setShowSearch(true);
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
  );
}
