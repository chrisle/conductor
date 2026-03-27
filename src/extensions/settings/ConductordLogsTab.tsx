import React, { useEffect, useState, useRef, useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { TabProps } from '@/extensions/types'

export default function ConductordLogsTab({ isActive }: TabProps): React.ReactElement {
  const [content, setContent] = useState('')
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const userScrolledUpRef = useRef(false)

  const scrollToBottom = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    const lineCount = model.getLineCount()
    editor.revealLine(lineCount)
    editor.setPosition({ lineNumber: lineCount, column: 1 })
  }, [])

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor

    // Track user scroll
    editor.onDidScrollChange((e) => {
      if (!e.scrollTopChanged) return
      const visibleRange = editor.getVisibleRanges()[0]
      const model = editor.getModel()
      if (!visibleRange || !model) return
      const lineCount = model.getLineCount()
      // Consider "at bottom" if within 3 lines of the end
      userScrolledUpRef.current = visibleRange.endLineNumber < lineCount - 2
    })

    scrollToBottom()
  }, [scrollToBottom])

  useEffect(() => {
    let disposed = false
    let watchId: string | null = null

    const handler = (_event: unknown, id: string, data: string) => {
      if (id !== watchId || disposed) return
      setContent(prev => {
        const updated = prev + data
        return updated
      })
    }

    window.electronAPI.onConductordLogs(handler)
    window.electronAPI.watchConductordLogs().then(id => {
      if (disposed) {
        window.electronAPI.unwatchConductordLogs(id)
        return
      }
      watchId = id
    })

    return () => {
      disposed = true
      window.electronAPI.offConductordLogs(handler)
      if (watchId) window.electronAPI.unwatchConductordLogs(watchId)
    }
  }, [])

  // Auto-scroll to bottom when content changes (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollToBottom()
    }
  }, [content, scrollToBottom])

  // Re-scroll when tab becomes active
  useEffect(() => {
    if (isActive && !userScrolledUpRef.current) {
      setTimeout(scrollToBottom, 50)
    }
  }, [isActive, scrollToBottom])

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language="log"
        value={content}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          readOnly: true,
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontLigatures: true,
          lineHeight: 1.5,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 8, bottom: 8 },
          smoothScrolling: true,
          renderLineHighlight: 'none',
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          overviewRulerBorder: false,
          domReadOnly: true,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  )
}
