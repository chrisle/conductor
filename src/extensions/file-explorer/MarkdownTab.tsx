import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useTabsStore } from '@/store/tabs'
import { useConfigStore } from '@/store/config'
import { useLayoutStore } from '@/store/layout'
import { extensionRegistry } from '@/extensions/registry'
import { useFileWatcher } from './useFileWatcher'
import type { TabProps } from '@/extensions/types'

mermaid.initialize({ startOnLoad: false, theme: 'dark' })

let mermaidId = 0

function MermaidBlock({ code, theme }: { code: string; theme: 'light' | 'dark' }): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${++mermaidId}`
    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' })
    mermaid.render(id, code).then(
      ({ svg }) => { if (!cancelled) setSvg(svg) },
      (err) => { if (!cancelled) setError(String(err)) },
    )
    return () => { cancelled = true }
  }, [code, theme])

  if (error) {
    return (
      <pre className="text-red-400 text-xs bg-zinc-800 rounded p-3 overflow-auto">
        {error}
      </pre>
    )
  }

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
}

type ViewMode = 'both' | 'source' | 'preview'

export default function MarkdownTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const filePath = tab.filePath
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('both')
  const [splitPercent, setSplitPercent] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const { updateTab } = useTabsStore()
  const markdownConfig = useConfigStore(s => s.config.customization.markdown)

  const reload = useCallback(() => { if (filePath) loadFile() }, [filePath])

  useEffect(() => { reload() }, [filePath])

  useFileWatcher(filePath, tab.isDirty, reload)

  async function loadFile() {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFile(filePath)
      if (result.success) {
        setContent(result.content || '')
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(`Error loading file: ${String(err)}`)
    }
    setIsLoading(false)
  }

  function handleChange(value: string | undefined) {
    const newContent = value || ''
    setContent(newContent)
    updateTab(groupId, tabId, { isDirty: true, content: newContent })
  }

  const handleSave = useCallback(async () => {
    if (!filePath || !content) return
    const result = await window.electronAPI.writeFile(filePath, content)
    if (result.success) {
      updateTab(groupId, tabId, { isDirty: false })
    }
  }, [filePath, content, groupId, tabId, updateTab])

  const mermaidTheme = markdownConfig.background
  const markdownComponents = useMemo(() => ({
    code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
      const match = /language-(\w+)/.exec(className || '')
      if (match?.[1] === 'mermaid') {
        return <MermaidBlock code={String(children).trim()} theme={mermaidTheme} />
      }
      return <code className={className} {...props}>{children}</code>
    },
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        if (!href) return

        // External URLs — open in default browser
        if (/^https?:\/\//.test(href)) {
          window.electronAPI.openExternal(href)
          return
        }

        // Anchor-only links — ignore
        if (href.startsWith('#')) return

        // Local file link — resolve relative to current file's directory
        const dir = filePath ? filePath.replace(/\/[^/]*$/, '') : ''
        const resolved = href.startsWith('/') ? href : `${dir}/${href}`
        const fileName = resolved.split('/').pop() || ''
        const tabType = extensionRegistry.getTabTypeForFile(fileName)

        const { addTab } = useTabsStore.getState()
        const { groups } = useTabsStore.getState()
        const layoutGroupIds = useLayoutStore.getState().getAllGroupIds()

        // If already open, focus it
        for (const [gid, group] of Object.entries(groups)) {
          if (!layoutGroupIds.includes(gid)) continue
          const existing = group.tabs.find(t => t.filePath === resolved)
          if (existing) {
            useTabsStore.getState().setActiveTab(gid, existing.id)
            useLayoutStore.getState().setFocusedGroup(gid)
            return
          }
        }

        addTab(groupId, {
          type: tabType,
          title: fileName,
          filePath: resolved,
        })
      }

      return <a {...props} href={href} onClick={handleClick}>{children}</a>
    },
  }), [filePath, groupId, mermaidTheme])

  if (isLoading) {
    return (
      <div className="flex h-full w-full">
        {/* Editor skeleton */}
        <div className="h-full w-1/2 border-r border-zinc-800 p-4 space-y-2">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-4" style={{ width: `${30 + ((i * 37) % 50)}%` }} />
            </div>
          ))}
        </div>
        {/* Preview skeleton */}
        <div className="h-full w-1/2 p-8">
          <div className="max-w-3xl mx-auto space-y-4">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-0" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm p-4">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full" onKeyDown={e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800 shrink-0 bg-zinc-900">
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 text-zinc-400 hover:text-zinc-200"
          onClick={() => setViewMode(prev => prev === 'preview' ? 'both' : 'preview')}
          title={viewMode === 'preview' ? 'Show source' : 'Hide source'}
        >
          {viewMode === 'preview' ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-6 h-6 text-zinc-400 hover:text-zinc-200"
          onClick={() => setViewMode(prev => prev === 'source' ? 'both' : 'source')}
          title={viewMode === 'source' ? 'Show preview' : 'Hide preview'}
        >
          {viewMode === 'source' ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div ref={containerRef} className="flex h-full w-full min-h-0">
        {/* Editor */}
        {viewMode !== 'preview' && (
          <div
            className="h-full border-r border-zinc-800"
            style={{ width: viewMode === 'source' ? '100%' : `${splitPercent}%` }}
          >
            <Editor
              height="100%"
              language="markdown"
              value={content}
              onChange={handleChange}
              theme="vs-dark"
              options={{
                fontSize: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ui-text-base').trim(), 10) || 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                fontLigatures: true,
                lineHeight: 1.6,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderWhitespace: 'selection',
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'line',
                lineNumbers: 'on',
                glyphMargin: false,
                folding: true,
                overviewRulerBorder: false,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6
                }
              }}
            />
          </div>
        )}

        {/* Resize handle */}
        {viewMode === 'both' && (
          <div
            className="shrink-0 w-1 cursor-col-resize bg-zinc-800 hover:bg-blue-500 active:bg-blue-500 transition-colors z-10"
            onMouseDown={e => {
              e.preventDefault()
              const container = containerRef.current
              if (!container) return
              document.body.style.cursor = 'col-resize'
              document.body.style.userSelect = 'none'
              let rafId: number | null = null
              const onMove = (ev: MouseEvent) => {
                if (rafId !== null) return
                rafId = requestAnimationFrame(() => {
                  rafId = null
                  const rect = container.getBoundingClientRect()
                  const pct = ((ev.clientX - rect.left) / rect.width) * 100
                  setSplitPercent(Math.max(15, Math.min(85, pct)))
                })
              }
              const onUp = () => {
                if (rafId !== null) cancelAnimationFrame(rafId)
                document.body.style.cursor = ''
                document.body.style.userSelect = ''
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
          />
        )}

        {/* Preview */}
        {viewMode !== 'source' && (
          <div
            className={cn(
              'h-full overflow-auto p-8',
              markdownConfig.background === 'dark' ? 'bg-zinc-900' : 'bg-white',
            )}
            style={{ width: viewMode === 'preview' ? '100%' : `${100 - splitPercent}%` }}
          >
            <div className={cn(
              'max-w-3xl mx-auto prose prose-base prose-img:rounded-lg',
              markdownConfig.background === 'dark'
                ? [
                    'prose-invert',
                    'prose-headings:text-zinc-100 prose-headings:font-semibold',
                    'prose-p:text-zinc-300 prose-p:leading-relaxed',
                    'prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline',
                    'prose-strong:text-zinc-100',
                    'prose-code:text-pink-400 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none',
                    'prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700 prose-pre:rounded-lg',
                    'prose-blockquote:border-zinc-600 prose-blockquote:text-zinc-400',
                    'prose-li:text-zinc-300',
                    'prose-th:text-zinc-100 prose-td:text-zinc-300',
                    'prose-hr:border-zinc-700',
                  ].join(' ')
                : [
                    'prose-zinc',
                    'prose-headings:text-zinc-900 prose-headings:font-semibold',
                    'prose-p:text-zinc-700 prose-p:leading-relaxed',
                    'prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline',
                    'prose-strong:text-zinc-900',
                    'prose-code:text-pink-600 prose-code:bg-zinc-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none',
                    'prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:rounded-lg',
                    'prose-blockquote:border-zinc-300 prose-blockquote:text-zinc-500',
                    'prose-li:text-zinc-700',
                    'prose-th:text-zinc-900 prose-td:text-zinc-700',
                    'prose-hr:border-zinc-200',
                  ].join(' '),
            )}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{
                markdownConfig.includeFrontmatter
                  ? content
                  : content.replace(/^---\n[\s\S]*?\n---\n/, '')
              }</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
