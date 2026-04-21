import { useEffect, useRef } from 'react'
import type { IpcRendererEvent } from 'electron'

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
  const watchIdRef = useRef<string | null>(null)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    if (!filePath) return

    let cancelled = false

    const handler = (_event: IpcRendererEvent, _watchId: string, changedPath: string) => {
      if (cancelled) return
      if (changedPath !== filePath) return
      if (isDirtyRef.current) return
      onChangedRef.current()
    }

    window.electronAPI.onFileChanged(handler)

    window.electronAPI.watchFile(filePath).then(id => {
      if (cancelled) {
        window.electronAPI.unwatchFile(id)
      } else {
        watchIdRef.current = id
      }
    })

    return () => {
      cancelled = true
      window.electronAPI.offFileChanged(handler)
      if (watchIdRef.current) {
        window.electronAPI.unwatchFile(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [filePath])
}
