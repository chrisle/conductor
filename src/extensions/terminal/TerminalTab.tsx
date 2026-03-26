import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { AUTOPILOT_RULES, stripAnsi, isThinking } from '@/lib/terminal-detection'
import type { TabProps } from '@/extensions/types'

export interface TerminalWatcher {
  id: string
  pattern: RegExp
  callback: (history: string) => void
  /** Minimum ms between callback fires. Default 500. */
  debounceMs?: number
}

export interface TerminalTabExtraProps {
  autoPilot?: boolean
  preventScreenClear?: boolean
  onThinkingChange?: (thinking: boolean) => void
  watchers?: TerminalWatcher[]
}

export default function TerminalTab({ tabId, groupId, isActive, tab, autoPilot = false, preventScreenClear = false, onThinkingChange, watchers }: TabProps & TerminalTabExtraProps): React.ReactElement {
  const cwd = tab.filePath
  const initialCommand = tab.initialCommand
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const isCreatedRef = useRef(false)
  const initCmdSentRef = useRef(false)
  const autoPilotRef = useRef(autoPilot)
  const preventScreenClearRef = useRef(preventScreenClear)
  const respondedBufRef = useRef('')
  const userScrolledUpRef = useRef(false)
  const onThinkingChangeRef = useRef(onThinkingChange)
  const wasThinkingRef = useRef(false)
  const watchersRef = useRef(watchers)
  const watchBufRef = useRef('')
  const watchLastMatchRef = useRef<Map<string, string>>(new Map())
  const watchLastFireRef = useRef<Map<string, number>>(new Map())
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { autoPilotRef.current = autoPilot }, [autoPilot])
  useEffect(() => { preventScreenClearRef.current = preventScreenClear }, [preventScreenClear])
  useEffect(() => { onThinkingChangeRef.current = onThinkingChange }, [onThinkingChange])
  useEffect(() => { watchersRef.current = watchers }, [watchers])

  // Custom fit: FitAddon uses dims.css.cell.width which on HiDPI is ~4% smaller
  // than the actual rendered cell width (7.23px vs 6.94px due to subpixel snapping).
  // This causes ~9 extra cols that overflow past the visible area.
  //
  // Fix: FitAddon correctly calculates the available width for text (accounting for
  // padding, scrollbar, etc.) — its SCREEN width after fit is the correct available
  // space. We just need to divide that by the REAL cell width instead of the wrong one.
  const measuredCellWidthRef = useRef<number>(0)

  function customFit() {
    const term = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!term || !term.element || !fitAddon) return
    const core = (term as any)._core

    // Step 1: Let FitAddon calculate and resize. After this, .xterm-screen width
    // equals the available space for text (FitAddon accounts for padding + scrollbar).
    fitAddon.fit()

    // Step 2: Read the screen width that FitAddon established — this IS the correct
    // available width, just divided by the wrong cell width.
    const screen = term.element.querySelector('.xterm-screen') as HTMLElement
    if (!screen) return
    const fitAddonScreenWidth = screen.clientWidth

    // Step 3: Measure actual rendered cell width from a span (once)
    if (measuredCellWidthRef.current === 0) {
      const spans = term.element.querySelectorAll('.xterm-rows span')
      for (const span of Array.from(spans)) {
        const text = span.textContent || ''
        if (text.length > 0 && text.trim().length > 0) {
          const rect = (span as HTMLElement).getBoundingClientRect()
          if (rect.width > 0) {
            measuredCellWidthRef.current = rect.width / text.length
            break
          }
        }
      }
    }

    // Step 4: If we have the real cell width, recalculate cols using
    // FitAddon's screen width (correct available space) / real cell width
    const realCellWidth = measuredCellWidthRef.current
    if (realCellWidth > 0 && core?._renderService) {
      const correctCols = Math.max(2, Math.floor(fitAddonScreenWidth / realCellWidth))
      if (term.cols > correctCols) {
        core._renderService.clear()
        term.resize(correctCols, term.rows)
      }
    }
  }

  useEffect(() => {
    if (!containerRef.current || isCreatedRef.current) return
    isCreatedRef.current = true

    const term = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        cursorAccent: '#09090b',
        selectionBackground: '#3f3f46',
        black: '#18181b',
        brightBlack: '#3f3f46',
        red: '#ef4444',
        brightRed: '#f87171',
        green: '#22c55e',
        brightGreen: '#4ade80',
        yellow: '#eab308',
        brightYellow: '#facc15',
        blue: '#3b82f6',
        brightBlue: '#60a5fa',
        magenta: '#a855f7',
        brightMagenta: '#c084fc',
        cyan: '#06b6d4',
        brightCyan: '#22d3ee',
        white: '#d4d4d8',
        brightWhite: '#f4f4f5'
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true
    })

    const fitAddon = new FitAddon()
    const searchAddon = new SearchAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(searchAddon)

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    term.open(containerRef.current)

    setTimeout(() => {
      customFit()
      const { cols, rows } = term
      window.electronAPI.createTerminal(tabId, cwd).then(() => {
        window.electronAPI.resizeTerminal(tabId, cols, rows)
        if (initialCommand && !initCmdSentRef.current) {
          initCmdSentRef.current = true
          setTimeout(() => window.electronAPI.writeTerminal(tabId, initialCommand), 500)
        }
      })
    }, 50)

    term.onData((data) => {
      window.electronAPI.writeTerminal(tabId, data)
      // User typed something — resume auto-scroll
      userScrolledUpRef.current = false
    })

    term.onResize(({ cols, rows }) => {
      window.electronAPI.resizeTerminal(tabId, cols, rows)
    })

    // Track user scroll-up via wheel events only (not programmatic scrolls)
    const el = containerRef.current
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // Scrolling up
        userScrolledUpRef.current = true
      } else {
        // Scrolling down — check if we're back at the bottom
        setTimeout(() => {
          if (disposed) return
          const buf = term.buffer.active
          if (buf.viewportY >= buf.baseY) {
            userScrolledUpRef.current = false
          }
        }, 50)
      }
    }
    el?.addEventListener('wheel', onWheel)

    let disposed = false
    let needsRefitAfterFirstData = true

    const handleTerminalData = (_event: any, id: string, data: string) => {
      if (id !== tabId || disposed) return

      // After first data arrives (shell prompt), re-fit with measured cell width
      if (needsRefitAfterFirstData) {
        needsRefitAfterFirstData = false
        setTimeout(() => customFit(), 100)
      }

      // Strip ANSI screen-clear sequences when prevented
      if (preventScreenClearRef.current) {
        data = data
          .replace(/\x1b\[2J/g, '')   // Erase entire display
          .replace(/\x1b\[3J/g, '')   // Erase scrollback
          .replace(/\x1bc/g, '')       // Full terminal reset (RIS)
        if (!data) return
      }

      term.write(data)

      // Auto-scroll to bottom unless user scrolled up
      if (!userScrolledUpRef.current) {
        term.scrollToBottom()
      }

      // Detect Claude thinking state from the last few screen lines
      if (onThinkingChangeRef.current) {
        const buf = term.buffer.active
        let tail = ''
        const linesToCheck = Math.min(5, term.rows)
        for (let i = term.rows - linesToCheck; i < term.rows; i++) {
          const line = buf.getLine(buf.baseY + i)
          if (line) tail += line.translateToString(true) + '\n'
        }
        const thinking = isThinking(tail)
        if (thinking !== wasThinkingRef.current) {
          wasThinkingRef.current = thinking
          onThinkingChangeRef.current(thinking)
        }
      }

      // --- Watcher system: sliding buffer + regex match ---
      if (watchersRef.current && watchersRef.current.length > 0) {
        const WATCH_BUF_MAX = 4096
        watchBufRef.current += data
        if (watchBufRef.current.length > WATCH_BUF_MAX) {
          watchBufRef.current = watchBufRef.current.slice(-WATCH_BUF_MAX)
        }
        const strippedBuf = stripAnsi(watchBufRef.current)
        console.debug('[watch] buffer updated, length:', watchBufRef.current.length, 'stripped length:', strippedBuf.length)

        for (const watcher of watchersRef.current) {
          // Reset lastIndex for global regexes
          if (watcher.pattern.global) watcher.pattern.lastIndex = 0
          const match = watcher.pattern.exec(strippedBuf)
          if (!match) continue

          const matchStr = match[0]
          const lastMatch = watchLastMatchRef.current.get(watcher.id)
          if (lastMatch === matchStr) {
            console.debug(`[watch] watcher "${watcher.id}" matched but duplicate, skipping:`, JSON.stringify(matchStr.slice(0, 80)))
            continue
          }

          // Debounce: don't fire faster than debounceMs (default 500)
          const now = Date.now()
          const cooldown = watcher.debounceMs ?? 500
          const lastFire = watchLastFireRef.current.get(watcher.id) ?? 0
          if (now - lastFire < cooldown) {
            console.debug(`[watch] watcher "${watcher.id}" throttled, ${now - lastFire}ms since last fire (cooldown: ${cooldown}ms)`)
            continue
          }

          console.debug(`[watch] watcher "${watcher.id}" fired! match:`, JSON.stringify(matchStr.slice(0, 120)))
          watchLastMatchRef.current.set(watcher.id, matchStr)
          watchLastFireRef.current.set(watcher.id, now)

          // Read full history from xterm buffer
          const buf = term.buffer.active
          let history = ''
          for (let i = 0; i <= buf.baseY + term.rows - 1; i++) {
            const line = buf.getLine(i)
            if (line) history += line.translateToString(true) + '\n'
          }
          console.debug(`[watch] passing history to callback, length: ${history.length}`)
          watcher.callback(history)
        }
      }

      if (!autoPilotRef.current) return

      // Read the actual screen contents from the BOTTOM of the buffer
      // (not viewport, which might be scrolled up)
      setTimeout(() => {
        const buf = term.buffer.active
        let screenText = ''
        for (let i = 0; i < term.rows; i++) {
          const line = buf.getLine(buf.baseY + i)
          if (line) screenText += line.translateToString(true) + '\n'
        }

        const stripped = stripAnsi(screenText)
        console.debug('[autopilot] screen text (last 200 chars):', JSON.stringify(stripped.trim().slice(-200)))

        for (const rule of AUTOPILOT_RULES) {
          const matched = rule.pattern.test(screenText)
          if (!matched) continue
          console.debug('[autopilot] matched rule:', rule.pattern.toString(), '→', JSON.stringify(rule.response))
          // Don't respond to the same screen twice
          const screenKey = screenText.trim().slice(-120)
          if (respondedBufRef.current === screenKey) {
            console.debug('[autopilot] skipping — already responded to this screen')
            continue
          }
          respondedBufRef.current = screenKey
          console.debug('[autopilot] sending response:', JSON.stringify(rule.response))
          setTimeout(() => window.electronAPI.writeTerminal(tabId, rule.response), 150)
          break
        }
      }, 50)
    }

    const handleTerminalExit = (_event: any, id: string) => {
      if (id === tabId) term.writeln('\r\n\x1b[90m[Process exited]\x1b[0m')
    }

    window.electronAPI.onTerminalData(handleTerminalData)
    window.electronAPI.onTerminalExit(handleTerminalExit)

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          const el = containerRef.current
          if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return
          customFit()
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom()
          }
        } catch {}
      }, 100)
    })
    if (wrapperRef.current) resizeObserver.observe(wrapperRef.current)

    return () => {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      window.electronAPI.offTerminalData(handleTerminalData)
      window.electronAPI.offTerminalExit(handleTerminalExit)
      // DON'T kill the terminal here — PTY stays alive for tab moves/reorders
      // Terminal is killed explicitly via closeTab in TabGroup
      el?.removeEventListener('wheel', onWheel)
      resizeObserver.disconnect()
      // Clear watch state so closed-over callbacks can be GC'd
      watchBufRef.current = ''
      watchLastMatchRef.current.clear()
      watchLastFireRef.current.clear()
      term.dispose()
      isCreatedRef.current = false
    }
  }, [tabId])

  useEffect(() => {
    if (isActive && terminalRef.current) {
      const doFit = () => {
        const el = containerRef.current
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          customFit()
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom()
          }
        }
      }
      setTimeout(() => {
        terminalRef.current?.focus()
        doFit()
      }, 50)
      // Second fit after layout has fully settled
      setTimeout(doFit, 200)
    }
  }, [isActive])

  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
  }, [showSearch])

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setShowSearch(false)
      searchAddonRef.current?.clearDecorations()
      terminalRef.current?.focus()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        searchAddonRef.current?.findPrevious(searchQuery)
      } else {
        searchAddonRef.current?.findNext(searchQuery)
      }
    }
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (value) {
      searchAddonRef.current?.findNext(value)
    } else {
      searchAddonRef.current?.clearDecorations()
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full min-w-0 bg-zinc-950 relative"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault()
          setShowSearch(true)
        }
      }}
    >
      {showSearch && (
        <div className="absolute top-1 right-2 z-10 flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 shadow-lg">
          <input
            ref={searchInputRef}
            className="bg-transparent text-xs text-zinc-200 outline-none w-48 placeholder-zinc-500"
            placeholder="Find..."
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <button
            className="text-zinc-400 hover:text-zinc-200 text-xs px-1"
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
          >&#9650;</button>
          <button
            className="text-zinc-400 hover:text-zinc-200 text-xs px-1"
            onClick={() => searchAddonRef.current?.findNext(searchQuery)}
          >&#9660;</button>
          <button
            className="text-zinc-400 hover:text-zinc-200 text-xs px-1"
            onClick={() => { setShowSearch(false); searchAddonRef.current?.clearDecorations(); terminalRef.current?.focus() }}
          >&#10005;</button>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full min-w-0 overflow-hidden"
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
  )
}
