import { useEffect, useRef } from 'react'
import type { IpcRendererEvent } from 'electron'

type WatcherCallback = (changedPath: string) => void

const watchers = new Map<string, WatcherCallback>()
let listenerInstalled = false

function ensureListener(): void {
  if (listenerInstalled) return
  listenerInstalled = true
  window.electronAPI.onFileChanged((_event: IpcRendererEvent, watchId: string, changedPath: string) => {
    const cb = watchers.get(watchId)
    if (cb) cb(changedPath)
  })
}

/**
 * Watches a file for external changes and calls `onChanged` when the file is
 * modified on disk. Automatically sets up / tears down the watcher when the
 * file path changes or the component unmounts.
 */
export function useFileWatcher(
  filePath: string | undefined,
  isDirty: boolean | undefined,
  onChanged: () => void,
): void {
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    if (!filePath) return

    let cancelled = false
    let watchId: string | null = null

    ensureListener()

    window.electronAPI.watchFile(filePath).then(id => {
      if (cancelled) {
        window.electronAPI.unwatchFile(id)
        return
      }
      watchId = id
      watchers.set(id, (changedPath) => {
        if (changedPath !== filePath) return
        if (isDirtyRef.current) return
        onChangedRef.current()
      })
    })

    return () => {
      cancelled = true
      if (watchId) {
        watchers.delete(watchId)
        window.electronAPI.unwatchFile(watchId)
        watchId = null
      }
    }
  }, [filePath])
}
