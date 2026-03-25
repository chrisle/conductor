import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { SearchAddon } from 'xterm-addon-search'
import 'xterm/css/xterm.css'
import { AUTOPILOT_RULES, stripAnsi, isThinking } from '@/lib/terminal-detection'

export interface TerminalTabProps {
  tabId: string
  groupId: string
  isActive: boolean
  cwd?: string
  initialCommand?: string
  autoPilot?: boolean
  onThinkingChange?: (thinking: boolean) => void
}

export default function TerminalTab({ tabId, isActive, cwd, initialCommand, autoPilot = false, onThinkingChange }: TerminalTabProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const isCreatedRef = useRef(false)
  const initCmdSentRef = useRef(false)
  const autoPilotRef = useRef(autoPilot)
  const respondedBufRef = useRef('')
  const userScrolledUpRef = useRef(false)
  const onThinkingChangeRef = useRef(onThinkingChange)
  const wasThinkingRef = useRef(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { autoPilotRef.current = autoPilot }, [autoPilot])
  useEffect(() => { onThinkingChangeRef.current = onThinkingChange }, [onThinkingChange])

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
      fitAddon.fit()
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
          const buf = term.buffer.active
          if (buf.viewportY >= buf.baseY) {
            userScrolledUpRef.current = false
          }
        }, 50)
      }
    }
    el?.addEventListener('wheel', onWheel)

    const handleTerminalData = (_event: any, id: string, data: string) => {
      if (id !== tabId) return
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
          fitAddon.fit()
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom()
          }
        } catch {}
      }, 100)
    })
    if (containerRef.current) resizeObserver.observe(containerRef.current)

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      window.electronAPI.offTerminalData(handleTerminalData)
      window.electronAPI.offTerminalExit(handleTerminalExit)
      // DON'T kill the terminal here — PTY stays alive for tab moves/reorders
      // Terminal is killed explicitly via closeTab in TabGroup
      el?.removeEventListener('wheel', onWheel)
      resizeObserver.disconnect()
      term.dispose()
      isCreatedRef.current = false
    }
  }, [tabId])

  useEffect(() => {
    if (isActive && terminalRef.current) {
      setTimeout(() => {
        terminalRef.current?.focus()
        // Only fit if container is visible and sized
        const el = containerRef.current
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          fitAddonRef.current?.fit()
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom()
          }
        }
      }, 50)
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
      className="h-full w-full bg-zinc-950 relative"
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
        className="h-full w-full"
        style={{ padding: '4px' }}
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
  )
}
