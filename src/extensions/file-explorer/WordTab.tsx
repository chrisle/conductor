import React, { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { Skeleton } from '@/components/ui/skeleton'
import type { TabProps } from '@/extensions/types'

export default function WordTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const filePath = tab.filePath
  const [html, setHtml] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (filePath) loadFile()
  }, [filePath])

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
      <div className="h-full w-full overflow-hidden p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-0" />
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
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
    <div className="h-full w-full overflow-auto p-8">
      <div
        className="max-w-3xl mx-auto prose prose-invert prose-zinc prose-base
          prose-headings:text-zinc-100 prose-headings:font-semibold
          prose-p:text-zinc-300 prose-p:leading-relaxed
          prose-a:text-blue-400
          prose-strong:text-zinc-200
          prose-li:text-zinc-300
          prose-th:text-zinc-200 prose-td:text-zinc-300
          prose-img:rounded-lg
          prose-table:border-collapse
        "
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
