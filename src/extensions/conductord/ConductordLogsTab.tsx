import React, { useEffect, useRef, useState } from 'react'
import { init as initGhostty, Terminal, FitAddon } from 'ghostty-web'
import { terminalConfig } from '@/extensions/terminal/theme'
import SearchBar from '@/extensions/terminal/SearchBar'
import type { TabProps } from '@/extensions/types'

const ghosttyReady = initGhostty()

export default function ConductordLogsTab({ isActive }: TabProps): React.ReactElement {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const isCreatedRef = useRef(false)
  const userScrolledUpRef = useRef(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  function doFit() {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return
    try { fitAddon.fit() } catch {}
  }

  function searchBuffer(query: string, direction: 'next' | 'previous') {
    const term = terminalRef.current
    if (!term || !query) return
    const buf = term.buffer.active
    let fullText = ''
    const lineStarts: number[] = []
    for (let i = 0; i <= buf.baseY + term.rows - 1; i++) {
      lineStarts.push(fullText.length)
      const line = buf.getLine(i)
      if (line) fullText += line.translateToString(true) + '\n'
    }
    const lower = fullText.toLowerCase()
    const needle = query.toLowerCase()
    const idx = direction === 'next' ? lower.indexOf(needle) : lower.lastIndexOf(needle)
    if (idx >= 0) {
      let matchLine = 0
      for (let i = 0; i < lineStarts.length; i++) {
        if (lineStarts[i] > idx) break
        matchLine = i
      }
      term.scrollToLine(matchLine)
    }
  }

  useEffect(() => {
    if (!containerRef.current || isCreatedRef.current) return
    isCreatedRef.current = true

    let disposed = false

    ghosttyReady.then(() => {
      if (disposed || !containerRef.current) return

      const term = new Terminal({
        ...terminalConfig,
        cursorBlink: false,
        cursorStyle: 'underline' as const,
        disableStdin: true,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      terminalRef.current = term
      fitAddonRef.current = fitAddon

      term.open(containerRef.current)
      setTimeout(() => doFit(), 50)

      // Track user scroll-up via wheel events
      const el = containerRef.current
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY < 0) {
          userScrolledUpRef.current = true
        } else {
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

      // Subscribe to conductord log data via IPC
      let watchId: string | null = null

      const handler = (_event: unknown, id: string, data: string) => {
        if (id !== watchId || disposed) return
        term.write(data)
        if (!userScrolledUpRef.current) {
          term.scrollToBottom()
        }
      }

      window.electronAPI.onConductordLogs(handler)
      window.electronAPI.watchConductordLogs().then(id => {
        if (disposed) {
          window.electronAPI.unwatchConductordLogs(id)
          return
        }
        watchId = id
      })

      // ResizeObserver for fit
      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const resizeObserver = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          try {
            const el = containerRef.current
            if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return
            doFit()
            if (!userScrolledUpRef.current) {
              terminalRef.current?.scrollToBottom()
            }
          } catch {}
        }, 100)
      })
      if (wrapperRef.current) resizeObserver.observe(wrapperRef.current)

      cleanupRef.current = () => {
        if (resizeTimer) clearTimeout(resizeTimer)
        window.electronAPI.offConductordLogs(handler)
        if (watchId) window.electronAPI.unwatchConductordLogs(watchId)
        el?.removeEventListener('wheel', onWheel)
        resizeObserver.disconnect()
        term.dispose()
      }
    })

    const cleanupRef = { current: () => {} }

    return () => {
      disposed = true
      isCreatedRef.current = false
      cleanupRef.current()
    }
  }, [])

  // Focus / fit on tab activation
  useEffect(() => {
    if (isActive && terminalRef.current) {
      const fitAndScroll = () => {
        const el = containerRef.current
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          doFit()
          if (!userScrolledUpRef.current) {
            terminalRef.current?.scrollToBottom()
          }
        }
      }
      setTimeout(fitAndScroll, 50)
      setTimeout(fitAndScroll, 200)
    }
  }, [isActive])

  return (
    <div
      ref={wrapperRef}
      className="h-full w-full min-w-0 bg-zinc-950 relative p-2"
      onKeyDownCapture={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
          e.preventDefault()
          e.stopPropagation()
          setShowSearch(true)
        }
      }}
    >
      {showSearch && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSearch={(dir) => searchBuffer(searchQuery, dir)}
          onClose={() => {
            setShowSearch(false)
            terminalRef.current?.focus()
          }}
        />
      )}
      <div
        ref={containerRef}
        className="h-full w-full min-w-0 overflow-hidden"
      />
    </div>
  )
}
