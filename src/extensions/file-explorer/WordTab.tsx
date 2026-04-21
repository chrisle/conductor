import React, { useEffect, useState, useRef, useCallback } from 'react'
import mammoth from 'mammoth'
import { Skeleton } from '@/components/ui/skeleton'
import { useFileWatcher } from './useFileWatcher'
import type { TabProps } from '@/extensions/types'

const PAGE_WIDTH = 816    // 8.5 inches at 96 DPI
const PAGE_HEIGHT = 1056  // 11 inches at 96 DPI
const MARGIN_X = 96       // 1-inch horizontal margins
const MARGIN_Y = 96       // 1-inch vertical margins
const CONTENT_PER_PAGE = PAGE_HEIGHT - 2 * MARGIN_Y // 864px usable per page
const PAGE_GAP = 24

const proseClasses = [
  'prose prose-base max-w-none',
  'prose-headings:text-zinc-900 prose-headings:font-semibold',
  'prose-p:text-zinc-800 prose-p:leading-relaxed',
  'prose-a:text-blue-600',
  'prose-strong:text-zinc-900',
  'prose-li:text-zinc-800',
  'prose-th:text-zinc-900 prose-td:text-zinc-700',
  'prose-img:rounded-lg',
  'prose-table:border-collapse',
].join(' ')

export default function WordTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const filePath = tab.filePath
  const [html, setHtml] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(1)
  const measureRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(() => { if (filePath) loadFile() }, [filePath])

  useEffect(() => { reload() }, [filePath])

  useFileWatcher(filePath, false, reload)

  useEffect(() => {
    if (!html) return
    const frame = requestAnimationFrame(() => {
      if (measureRef.current) {
        const h = measureRef.current.scrollHeight
        setPageCount(Math.max(1, Math.ceil(h / CONTENT_PER_PAGE)))
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [html])

  async function loadFile() {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFileBinary(filePath)
      if (result.success && result.data) {
        const arrayBuffer = result.data
        const converted = await mammoth.convertToHtml({ arrayBuffer })
        setHtml(converted.value)
      } else {
        setError(result.error || 'Failed to load file')
      }
    } catch (err) {
      setError(`Error loading file: ${String(err)}`)
    }
    setIsLoading(false)
  }

  if (isLoading) {
    return (
      <div className="h-full w-full overflow-auto" style={{ background: '#525659' }}>
        <div className="py-6 flex flex-col items-center">
          <div
            className="bg-white"
            style={{
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              padding: MARGIN_Y,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <div className="space-y-4">
              <Skeleton className="h-7 w-2/5 bg-zinc-200" />
              <Skeleton className="h-4 w-full bg-zinc-200" />
              <Skeleton className="h-4 w-4/5 bg-zinc-200" />
              <Skeleton className="h-4 w-full bg-zinc-200" />
              <Skeleton className="h-4 w-0 bg-zinc-200" />
              <Skeleton className="h-5 w-1/3 bg-zinc-200" />
              <Skeleton className="h-4 w-full bg-zinc-200" />
              <Skeleton className="h-4 w-3/4 bg-zinc-200" />
              <Skeleton className="h-4 w-5/6 bg-zinc-200" />
              <Skeleton className="h-4 w-full bg-zinc-200" />
              <Skeleton className="h-4 w-2/3 bg-zinc-200" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-ui-base p-4">
        {error}
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-auto" style={{ background: '#525659' }}>
      {/* Hidden div to measure content height at page width */}
      <div
        ref={measureRef}
        className={proseClasses}
        style={{
          position: 'absolute',
          visibility: 'hidden',
          width: PAGE_WIDTH - 2 * MARGIN_X,
          pointerEvents: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Paginated view */}
      <div className="py-6 flex flex-col items-center">
        {Array.from({ length: pageCount }).map((_, i) => (
          <div
            key={i}
            className="bg-white relative"
            style={{
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              marginBottom: i < pageCount - 1 ? PAGE_GAP : 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Content shifted up so each page shows its portion */}
            <div
              className={proseClasses}
              style={{
                position: 'absolute',
                top: MARGIN_Y - i * CONTENT_PER_PAGE,
                left: MARGIN_X,
                width: PAGE_WIDTH - 2 * MARGIN_X,
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {/* Top margin mask */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: MARGIN_Y,
                background: 'white',
                zIndex: 1,
              }}
            />
            {/* Bottom margin mask */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: MARGIN_Y,
                background: 'white',
                zIndex: 1,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
