import React, { useEffect, useState } from 'react'
import type { TabProps } from '@/extensions/types'

export default function ImageTab({ tab }: TabProps): React.ReactElement {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tab.filePath) return
    // Use a file:// URL for local images
    setSrc(`file://${tab.filePath}`)
  }, [tab.filePath])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        {error}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950 overflow-auto p-4">
      {src && (
        <img
          src={src}
          alt={tab.title}
          className="max-w-full max-h-full object-contain"
          onError={() => setError('Failed to load image')}
          draggable={false}
        />
      )}
    </div>
  )
}
