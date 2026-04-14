import React, { useEffect, useState, useCallback } from 'react'
import { Minus, Square, X, Maximize2, ChevronDown, FolderOpen, Plus, Pencil, Trash2, FilePlus2, SaveAll, AppWindow, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useActivityBarStore } from '@/store/activityBar'
import { useProjectStore } from '@/store/project'
import {
  saveProject,
  saveProjectAs,
  openProjectDialog,
  openProject,
  createDefaultProject,
  switchWorkspace,
  addWorkspace,
  deleteWorkspace,
  renameWorkspace,
  renameProject,
} from '@/lib/project-io'

type PendingAction =
  | { type: 'close' }
  | { type: 'switchWorkspace'; name: string }

type DialogMode =
  | { type: 'unsaved'; action: PendingAction }
  | { type: 'renameWorkspace'; name: string }
  | { type: 'deleteWorkspace'; name: string }
  | { type: 'renameProject' }
  | null

export default function TitleBar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false)
  const [dialog, setDialog] = useState<DialogMode>(null)
  const [inputValue, setInputValue] = useState('')
  const { activeExtensionId, toggleExtension, toggleSidebar } = useActivityBarStore()
  const projectName = useProjectStore(s => s.name)
  const activeWorkspace = useProjectStore(s => s.activeWorkspace)
  const workspaceNames = useProjectStore(s => s.workspaceNames)
  const recentProjects = useProjectStore(s => s.recentProjects)
  const filePath = useProjectStore(s => s.filePath)
  const isAnyDirty = useProjectStore(s => s.isAnyDirty)

  useEffect(() => {
    window.electronAPI.isMaximized().then(setIsMaximized)
  }, [])

  useEffect(() => {
    const callback = () => {
      if (useProjectStore.getState().isAnyDirty()) {
        setDialog({ type: 'unsaved', action: { type: 'close' } })
      } else {
        window.electronAPI.forceClose()
      }
    }
    const handler = window.electronAPI.onCloseRequested(callback)
    return () => window.electronAPI.offCloseRequested(handler)
  }, [])

  const handleMinimize = () => window.electronAPI.minimize()
  const handleMaximize = async () => {
    await window.electronAPI.maximize()
    setIsMaximized(await window.electronAPI.isMaximized())
  }

  const handleClose = useCallback(() => {
    if (useProjectStore.getState().isAnyDirty()) {
      setDialog({ type: 'unsaved', action: { type: 'close' } })
    } else {
      window.electronAPI.forceClose()
    }
  }, [])

  const handleSwitchWorkspace = useCallback((name: string) => {
    if (useProjectStore.getState().isWorkspaceDirty()) {
      setDialog({ type: 'unsaved', action: { type: 'switchWorkspace', name } })
    } else {
      switchWorkspace(name)
    }
  }, [])

  const handleSave = useCallback(async () => {
    const { filePath } = useProjectStore.getState()
    if (filePath) await saveProject(filePath)
    else await saveProjectAs()
  }, [])

  // Unsaved dialog actions
  const executeUnsavedAction = useCallback(async (action: PendingAction) => {
    if (action.type === 'close') {
      window.electronAPI.forceClose()
    } else if (action.type === 'switchWorkspace') {
      await switchWorkspace(action.name)
    }
  }, [])

  const handleUnsavedSave = useCallback(async () => {
    if (dialog?.type !== 'unsaved') return
    await handleSave()
    await executeUnsavedAction(dialog.action)
    setDialog(null)
  }, [dialog, handleSave, executeUnsavedAction])

  const handleUnsavedDiscard = useCallback(async () => {
    if (dialog?.type !== 'unsaved') return
    useProjectStore.getState().clearWorkspaceDirty()
    await executeUnsavedAction(dialog.action)
    setDialog(null)
  }, [dialog, executeUnsavedAction])

  const isMac = window.electronAPI.platform === 'darwin'
  const otherProjects = recentProjects.filter(p => p.path !== filePath)

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="drag-region flex items-center h-8 bg-zinc-900/80 border-b border-zinc-700/50 shrink-0 select-none"
        style={{ minHeight: 32 }}
      >
        {/* Mac traffic lights */}
        {isMac && (
          <div className="no-drag flex items-center gap-1.5 pl-4 pr-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors flex items-center justify-center group">
                  <X className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors flex items-center justify-center group">
                  <Minus className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Minimize</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors flex items-center justify-center group">
                  <Maximize2 className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Maximize</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Sidebar toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className="no-drag flex items-center justify-center w-7 h-7 rounded transition-colors text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 ml-1"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle Sidebar</TooltipContent>
        </Tooltip>

        {/* Breadcrumb — individual buttons are no-drag, gaps between them remain draggable */}
        <div className="flex-1 flex items-center justify-center gap-1 overflow-hidden px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="no-drag flex items-center gap-0.5 text-ui-sm text-zinc-500 hover:text-zinc-300 transition-colors rounded px-1 py-0.5 hover:bg-zinc-800/50">
                <svg className="w-3 h-3" viewBox="0 0 375 375" fill="currentColor" fillRule="evenodd">
                  <circle cx="187.5" cy="188" r="165.7"/>
                  <path d="M274.49 281.98C301.57 259.26 316.13 229.46 317.41 201.15L247.26 188.81C244.81 200.53 239.85 213.48 227.74 223.65C207.62 240.53 180.12 240.76 160.21 217.01C140.73 193.81 144.96 167.42 165.85 149.90C178.49 139.29 192.73 137.43 204.93 137.31L207.32 66.31C177.98 60.62 145.15 69.70 116.52 93.73C61.60 139.82 51.52 208.48 100.65 267.01C149.76 325.56 219.57 328.07 274.49 281.98Z"/>
                </svg>
                Conductor
                <ChevronDown className="w-2.5 h-2.5 text-zinc-600" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44 shadow-xl shadow-black/50">
              <DropdownMenuItem onSelect={() => window.electronAPI.openNewWindow()} className="text-ui-sm">
                <AppWindow className="w-3 h-3 mr-2 text-zinc-500" />
                New Window
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {projectName && (
            <>
              <span className="text-ui-sm text-zinc-600">›</span>

              {/* Project dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="no-drag flex items-center gap-0.5 text-ui-sm text-zinc-300 hover:text-zinc-100 transition-colors rounded px-1 py-0.5 hover:bg-zinc-800/50">
                    {projectName}{isAnyDirty() ? ' *' : ''}
                    <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56 shadow-xl shadow-black/50">
                  <DropdownMenuItem onSelect={() => { setInputValue(projectName); setDialog({ type: 'renameProject' }) }} className="text-ui-sm">
                    <Pencil className="w-3 h-3 mr-2 text-zinc-500" />
                    Rename Project
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => saveProjectAs()} className="text-ui-sm">
                    <SaveAll className="w-3 h-3 mr-2 text-zinc-500" />
                    Save Project As...
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => createDefaultProject()} className="text-ui-sm">
                    <FilePlus2 className="w-3 h-3 mr-2 text-zinc-500" />
                    New Project
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {otherProjects.length > 0 && (
                    <>
                      {otherProjects.slice(0, 8).map((p) => (
                        <DropdownMenuItem key={p.path} onSelect={() => openProject(p.path)} className="text-ui-sm">
                          <FolderOpen className="w-3 h-3 mr-2 text-zinc-500" />
                          <span className="truncate">{p.name}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem onSelect={() => openProjectDialog()} className="text-ui-sm">
                    Open Project...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {activeWorkspace && workspaceNames.length > 0 && (
                <>
                  <span className="text-ui-sm text-zinc-600">›</span>

                  {/* Workspace dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="no-drag flex items-center gap-0.5 text-ui-sm text-zinc-400 hover:text-zinc-200 transition-colors rounded px-1 py-0.5 hover:bg-zinc-800/50">
                        {activeWorkspace}
                        <ChevronDown className="w-2.5 h-2.5 text-zinc-500" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-52 shadow-xl shadow-black/50">
                      {workspaceNames.map((name) => (
                        <DropdownMenuItem
                          key={name}
                          onSelect={() => name !== activeWorkspace && handleSwitchWorkspace(name)}
                          className={`text-ui-sm ${name === activeWorkspace ? 'text-blue-400' : ''}`}
                        >
                          <span className="flex-1">{name}</span>
                          {name === activeWorkspace && (
                            <span className="text-ui-xs text-zinc-600">current</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => addWorkspace()} className="text-ui-sm">
                        <Plus className="w-3 h-3 mr-2 text-zinc-500" />
                        New Workspace
                      </DropdownMenuItem>
                      {activeWorkspace && (
                        <>
                          <DropdownMenuItem
                            onSelect={() => { setInputValue(activeWorkspace); setDialog({ type: 'renameWorkspace', name: activeWorkspace }) }}
                            className="text-ui-sm"
                          >
                            <Pencil className="w-3 h-3 mr-2 text-zinc-500" />
                            Rename "{activeWorkspace}"
                          </DropdownMenuItem>
                          {workspaceNames.length > 1 && (
                            <DropdownMenuItem
                              onSelect={() => setDialog({ type: 'deleteWorkspace', name: activeWorkspace })}
                              className="text-ui-sm text-red-400"
                            >
                              <Trash2 className="w-3 h-3 mr-2" />
                              Delete "{activeWorkspace}"
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </>
          )}

          {!projectName && (
            <span className="text-ui-sm text-zinc-500 ml-1">No project open</span>
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

      {/* Unsaved changes dialog */}
      <Dialog open={dialog?.type === 'unsaved'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Unsaved Changes</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-ui-base text-zinc-300 font-medium">Unsaved Changes</div>
            <div className="text-ui-sm text-zinc-400">
              {dialog?.type === 'unsaved' && dialog.action.type === 'switchWorkspace'
                ? 'You have unsaved changes. Save before switching workspaces?'
                : 'You have unsaved changes. Save before closing?'}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-ui-sm text-zinc-400 hover:text-zinc-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="ghost" className="text-ui-sm text-zinc-400 hover:text-zinc-200" onClick={handleUnsavedDiscard}>Don't Save</Button>
            <Button className="text-ui-sm bg-blue-600 hover:bg-blue-500 text-white" onClick={handleUnsavedSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename workspace dialog */}
      <Dialog open={dialog?.type === 'renameWorkspace'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Rename Workspace</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-ui-base text-zinc-300 font-medium">Rename Workspace</div>
            <input
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-ui-sm text-zinc-200 outline-none focus:border-blue-500"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dialog?.type === 'renameWorkspace' && inputValue.trim() && renameWorkspace(dialog.name, inputValue.trim()).then(() => setDialog(null))}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-ui-sm text-zinc-400 hover:text-zinc-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              className="text-ui-sm bg-blue-600 hover:bg-blue-500 text-white"
              disabled={!inputValue.trim() || (dialog?.type === 'renameWorkspace' && inputValue.trim() === dialog.name)}
              onClick={async () => {
                if (dialog?.type === 'renameWorkspace' && inputValue.trim()) {
                  await renameWorkspace(dialog.name, inputValue.trim())
                  setDialog(null)
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename project dialog */}
      <Dialog open={dialog?.type === 'renameProject'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Rename Project</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-ui-base text-zinc-300 font-medium">Rename Project</div>
            <input
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-ui-sm text-zinc-200 outline-none focus:border-blue-500"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inputValue.trim() && renameProject(inputValue.trim()).then(() => setDialog(null))}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-ui-sm text-zinc-400 hover:text-zinc-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              className="text-ui-sm bg-blue-600 hover:bg-blue-500 text-white"
              disabled={!inputValue.trim() || inputValue.trim() === projectName}
              onClick={async () => {
                if (inputValue.trim()) {
                  await renameProject(inputValue.trim())
                  setDialog(null)
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete workspace dialog */}
      <Dialog open={dialog?.type === 'deleteWorkspace'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Delete Workspace</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-ui-base text-zinc-300 font-medium">Delete Workspace</div>
            <div className="text-ui-sm text-zinc-400">
              Are you sure you want to delete "{dialog?.type === 'deleteWorkspace' ? dialog.name : ''}"? This cannot be undone.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-ui-sm text-zinc-400 hover:text-zinc-200" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              className="text-ui-sm bg-red-600 hover:bg-red-500 text-white"
              onClick={async () => {
                if (dialog?.type === 'deleteWorkspace') {
                  await deleteWorkspace(dialog.name)
                  setDialog(null)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
