import React, { useEffect, useState, useCallback } from 'react'
import { Minus, Square, X, Maximize2, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'
import { useProjectStore } from '@/store/project'
import { saveProject, saveProjectAs } from '@/lib/project-io'

export default function TitleBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const { rootPath } = useSidebarStore()
  const { activeExtensionId, toggleExtension } = useActivityBarStore()
  const projectName = useProjectStore(s => s.name)

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized)
  }, [])

  useEffect(() => {
    if (!rootPath) return
    let cancelled = false
    const fetch = async () => {
      const branch = await window.electronAPI.gitBranch(rootPath)
      if (!cancelled) setGitBranch(branch)
    }
    fetch()
    const id = setInterval(fetch, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [rootPath])

  // Listen for system-initiated close (Cmd+Q, red button via main process)
  useEffect(() => {
    const handler = () => {
      const { isAnyDirty } = useProjectStore.getState()
      if (isAnyDirty()) {
        setCloseDialogOpen(true)
      } else {
        window.electronAPI.forceClose()
      }
    }
    window.electronAPI.onCloseRequested(handler)
    return () => window.electronAPI.offCloseRequested(handler)
  }, [])

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = async () => {
    await window.electronAPI.maximize()
    setIsMaximized(await window.electronAPI.isMaximized())
  }

  const handleClose = useCallback(() => {
    const { isAnyDirty } = useProjectStore.getState()
    if (isAnyDirty()) {
      setCloseDialogOpen(true)
    } else {
      window.electronAPI.forceClose()
    }
  }, [])

  const handleCloseSave = useCallback(async () => {
    const { filePath } = useProjectStore.getState()
    if (filePath) await saveProject(filePath)
    else await saveProjectAs()
    setCloseDialogOpen(false)
    window.electronAPI.forceClose()
  }, [])

  const handleCloseDiscard = useCallback(() => {
    setCloseDialogOpen(false)
    window.electronAPI.forceClose()
  }, [])

  const isMac = window.electronAPI.platform === 'darwin'

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="drag-region flex items-center h-8 bg-zinc-900 border-b border-zinc-800 shrink-0 select-none"
        style={{ minHeight: 32 }}
      >
        {/* Mac traffic lights */}
        {isMac && (
          <div className="no-drag flex items-center gap-1.5 pl-4 pr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group"
                >
                  <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleMinimize}
                  className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors flex items-center justify-center group"
                >
                  <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Minimize</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleMaximize}
                  className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors flex items-center justify-center group"
                >
                  <Maximize2 className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Maximize</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Title */}
        <div className="flex-1 flex items-center justify-center gap-2 overflow-hidden px-4">
          <span className="text-xs text-zinc-500 truncate">
            Conductor v0.1.0{projectName ? ` — ${projectName}` : ''}
          </span>
          {gitBranch && (
            <Badge variant="outline" className="h-4 px-1.5 gap-1 text-[10px] text-fuchsia-400 border-fuchsia-900 bg-fuchsia-950/30 shrink-0">
              <GitBranch className="w-2.5 h-2.5" />
              {gitBranch}
            </Badge>
          )}
        </div>

        {/* Windows controls */}
        {!isMac && (
          <div className="no-drag flex items-center">
            <Button variant="ghost" size="icon" onClick={handleMinimize} className="h-8 w-10 rounded-none">
              <Minus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleMaximize} className="h-8 w-10 rounded-none">
              <Square className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-10 rounded-none hover:bg-red-600 hover:text-white">
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Close confirmation dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={(open) => !open && setCloseDialogOpen(false)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Unsaved Changes</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Unsaved Changes</div>
            <div className="text-xs text-zinc-400">
              You have unsaved changes. Would you like to save before closing?
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleCloseDiscard}>
              Don't Save
            </Button>
            <Button className="text-xs bg-blue-600 hover:bg-blue-500 text-white" onClick={handleCloseSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
