import React, { useEffect, useState } from 'react'
import { Minus, Square, X, Maximize2, GitBranch, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { useSidebarStore } from '@/store/sidebar'

export default function TitleBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const { isVisible, toggleVisibility, rootPath, favorites, setRootPath, removeFavorite } = useSidebarStore()

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

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = async () => {
    await window.electronAPI.maximize()
    setIsMaximized(await window.electronAPI.isMaximized())
  }
  const handleClose = () => window.electronAPI.close()
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

        {/* Sidebar toggle */}
        <div className="no-drag">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleVisibility} className="h-8 w-8 rounded-none">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="4" height="14" rx="1" opacity="0.5" />
                  <rect x="7" y="1" width="8" height="14" rx="1" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isVisible ? 'Hide sidebar' : 'Show sidebar'}</TooltipContent>
          </Tooltip>
        </div>

        {/* Dir + branch */}
        <div className="flex-1 flex items-center justify-center gap-2 overflow-hidden px-4">
          {rootPath && (
            <div className="no-drag">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-xs text-zinc-400 hover:text-zinc-200 truncate transition-colors cursor-pointer">
                    {rootPath.replace(/^\/Users\/[^/]+/, '~')}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-64 bg-zinc-900 border-zinc-700">
                  {favorites.length > 0 ? (
                    <>
                      {favorites.map(fav => (
                        <DropdownMenuItem
                          key={fav}
                          className="gap-2 text-xs cursor-pointer justify-between group"
                          onClick={() => setRootPath(fav)}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Star className="w-3 h-3 text-yellow-500 shrink-0 fill-yellow-500" />
                            <span className="truncate">{fav.replace(/^\/Users\/[^/]+/, '~')}</span>
                          </div>
                          <button
                            className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 shrink-0"
                            onClick={(e) => { e.stopPropagation(); removeFavorite(fav) }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </>
                  ) : (
                    <div className="px-3 py-2 text-xs text-zinc-600">
                      No favorites yet. Right-click a folder to add one.
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
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
    </TooltipProvider>
  )
}
