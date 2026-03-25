import React, { useRef, useCallback } from 'react'
import { Terminal, Globe, FilePlus, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useSidebarStore } from '@/store/sidebar'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import FileTree from './FileTree'

interface SidebarProps {
  defaultGroupId: string
}

export default function Sidebar({ defaultGroupId }: SidebarProps): React.ReactElement {
  const { width, isVisible, setWidth } = useSidebarStore()
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      setWidth(startWidth.current + (e.clientX - startX.current))
    }
    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, setWidth])

  function triggerNewFile() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'file' } }))
  }
  function triggerNewFolder() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'folder' } }))
  }
  function openNewTerminal() {
    addTab(focusedGroupId || defaultGroupId, { type: 'terminal', title: 'Terminal' })
  }
  function openNewBrowser() {
    addTab(focusedGroupId || defaultGroupId, { type: 'browser', title: 'Browser', url: 'https://google.com' })
  }

  if (!isVisible) return <></>

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex shrink-0" style={{ width }}>
        <div className="flex flex-col flex-1 h-full bg-zinc-900 border-r border-zinc-800 overflow-hidden min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-2 h-8 border-b border-zinc-800 shrink-0">
            <span />
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={triggerNewFile} className="h-6 w-6">
                    <FilePlus className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New file</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={triggerNewFolder} className="h-6 w-6">
                    <FolderPlus className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New folder</TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-4 mx-1 bg-zinc-800" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={openNewTerminal} className="h-6 w-6">
                    <Terminal className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New terminal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={openNewBrowser} className="h-6 w-6">
                    <Globe className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New browser</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-hidden">
            <FileTree groupId={defaultGroupId} />
          </div>
        </div>

        {/* Resize handle */}
        <div
          className={cn('w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-500 transition-colors')}
          onMouseDown={handleResizeStart}
        />
      </div>
    </TooltipProvider>
  )
}
