import React from 'react'
import { Terminal, Globe, FilePlus, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import FileTree from '@/components/Sidebar/FileTree'

interface FileExplorerSidebarProps {
  groupId: string
}

export default function FileExplorerSidebar({ groupId }: FileExplorerSidebarProps): React.ReactElement {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()

  function triggerNewFile() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'file' } }))
  }
  function triggerNewFolder() {
    window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'folder' } }))
  }
  function openNewTerminal() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'terminal', title: 'Terminal', filePath: rootPath || undefined })
  }
  function openNewBrowser() {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'browser', title: 'Browser', url: 'https://google.com' })
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-full overflow-hidden min-w-0">
        {/* Header toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Files</span>
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
          <FileTree groupId={groupId} />
        </div>
      </div>
    </TooltipProvider>
  )
}
