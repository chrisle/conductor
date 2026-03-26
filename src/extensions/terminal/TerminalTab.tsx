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
  const watchBufRef = useRef("");
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
    if (!fitAddon) return;
    try {
      fitAddon.fit();
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

    ghosttyReady.then(() => {
      if (disposed || !containerRef.current) return;

      const term = new Terminal(terminalConfig);

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      term.open(containerRef.current);

      setTimeout(() => {
        doFit();
        const { cols, rows } = term;
        console.log(`[terminal] ghostty fit: cols=${cols} rows=${rows}`);
        termAPI.createTerminal(tabId, cwd).then(() => {
          termAPI.resizeTerminal(tabId, cols, rows);
          if (initialCommand && !initCmdSentRef.current) {
            initCmdSentRef.current = true;
            setTimeout(
              () => termAPI.writeTerminal(tabId, initialCommand),
              500,
            );
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

        processWatchers(term, data);
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
        watchBufRef.current = "";
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
  function processWatchers(term: Terminal, data: string) {
    if (!watchersRef.current || watchersRef.current.length === 0) return;

    const WATCH_BUF_MAX = 4096;
    watchBufRef.current += data;
    if (watchBufRef.current.length > WATCH_BUF_MAX) {
      watchBufRef.current = watchBufRef.current.slice(-WATCH_BUF_MAX);
    }
    const strippedBuf = stripAnsi(watchBufRef.current);

    for (const watcher of watchersRef.current) {
      if (watcher.pattern.global) watcher.pattern.lastIndex = 0;
      const match = watcher.pattern.exec(strippedBuf);
      if (!match) continue;

      const matchStr = match[0];
      if (watchLastMatchRef.current.get(watcher.id) === matchStr) continue;

      const now = Date.now();
      const cooldown = watcher.debounceMs ?? 500;
      const lastFire = watchLastFireRef.current.get(watcher.id) ?? 0;
      if (now - lastFire < cooldown) continue;

      watchLastMatchRef.current.set(watcher.id, matchStr);
      watchLastFireRef.current.set(watcher.id, now);

      const buf = term.buffer.active;
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

      for (const rule of AUTOPILOT_RULES) {
        if (!rule.pattern.test(screenText)) continue;

        const screenKey = screenText.trim().slice(-120);
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
