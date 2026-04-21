import React, { useEffect, useState, useCallback } from 'react'
import { pptxToHtml } from '@jvmr/pptx-to-html'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useFileWatcher } from './useFileWatcher'
import type { TabProps } from '@/extensions/types'

export default function PowerPointTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const filePath = tab.filePath
  const [slides, setSlides] = useState<string[]>([])
  const [activeSlide, setActiveSlide] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => { if (filePath) loadFile() }, [filePath])

  useEffect(() => { reload() }, [filePath])

  useFileWatcher(filePath, false, reload)

  async function loadFile() {
    if (!filePath) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFileBinary(filePath)
      if (result.success && result.data) {
        const html = await pptxToHtml(result.data, { scaleToFit: true })
        setSlides(html)
        setActiveSlide(0)
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
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="w-[640px] aspect-video">
          <Skeleton className="h-full w-full rounded-lg" />
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

  if (slides.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-ui-base">
        No slides
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {/* Slide content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-8">
        <div
          className="w-full max-w-4xl aspect-video"
          dangerouslySetInnerHTML={{ __html: slides[activeSlide] }}
        />
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-zinc-200 bg-zinc-50 shrink-0">
        <button
          onClick={() => setActiveSlide(i => Math.max(0, i - 1))}
          disabled={activeSlide === 0}
          className="p-1 rounded hover:bg-zinc-200 text-zinc-600 disabled:text-zinc-300 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-ui-sm text-zinc-600 tabular-nums">
          {activeSlide + 1} / {slides.length}
        </span>
        <button
          onClick={() => setActiveSlide(i => Math.min(slides.length - 1, i + 1))}
          disabled={activeSlide === slides.length - 1}
          className="p-1 rounded hover:bg-zinc-200 text-zinc-600 disabled:text-zinc-300 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
