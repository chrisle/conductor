import React, { useEffect, useState, useCallback } from 'react'
import { useFileWatcher } from './useFileWatcher'
import type { TabProps } from '@/extensions/types'

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
}

export default function ImageTab({ tab }: TabProps): React.ReactElement {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadImage = useCallback(() => {
    if (!tab.filePath) return
    setError('')
    window.electronAPI.readFileBinary(tab.filePath).then(result => {
      if (!result.success || !result.data) {
        setError('Failed to load image')
        return
      }
      const ext = tab.filePath!.split('.').pop()?.toLowerCase() || ''
      const mime = MIME[ext] || 'image/png'
      const bytes = new Uint8Array(result.data)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      setSrc(`data:${mime};base64,${btoa(binary)}`)
    })
  }, [tab.filePath])

  useEffect(() => { loadImage() }, [loadImage])

  useFileWatcher(tab.filePath, false, loadImage)

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-ui-base text-zinc-500">
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
