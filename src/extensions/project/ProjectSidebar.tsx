import React, { useEffect, useState, useRef } from 'react'
import { Save, Plus, RefreshCw, FolderOpen, Circle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useProjectStore } from '@/store/project'
import {
  openProjectDialog,
  openProject,
  saveProject,
  saveProjectAs,
  switchWorkspace,
  addWorkspace,
  deleteWorkspace
} from '@/lib/project-io'

export default function ProjectSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const {
    filePath, name, isDirty,
    activeWorkspace, workspaceNames,
    recentProjects, loadRecentProjects
  } = useProjectStore()

  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newError, setNewError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadRecentProjects() }, [])

  async function handleSave() {
    if (filePath) await saveProject(filePath)
    else await saveProjectAs()
  }

  async function handleCreateWorkspace() {
    const trimmed = newName.trim()
    if (!trimmed) { setNewError('Name is required'); return }
    if (workspaceNames.includes(trimmed)) { setNewError('Already exists'); return }

    await addWorkspace(trimmed)
    setNewDialogOpen(false)
    setNewName('')
    setNewError('')
  }

  function openNewDialog() {
    setNewName('')
    setNewError('')
    setNewDialogOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="flex flex-col h-full text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Project</span>
          <span className="text-[11px] text-zinc-300 truncate max-w-[140px] leading-tight">
            {name || 'No project open'}{isDirty ? '*' : ''}
          </span>
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={handleSave} disabled={!filePath || (!isDirty && !!filePath)} title="Save">
            <Save className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={() => openProjectDialog()} title="Open...">
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Workspaces */}
        {filePath && (
          <>
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Workspaces</span>
              <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-zinc-300"
                onClick={openNewDialog} title="New Workspace">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            {workspaceNames.length === 0 && (
              <div className="px-3 pb-2 text-xs text-zinc-500">No workspaces</div>
            )}
            {workspaceNames.map((wsName) => {
              const isActive = wsName === activeWorkspace
              return (
                <div key={wsName}
                  className={`flex items-center gap-2 px-3 py-1.5 transition-colors group ${
                    isActive ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/50 cursor-pointer'
                  }`}
                  onClick={() => !isActive && switchWorkspace(wsName)}
                >
                  <Circle className={`w-2 h-2 shrink-0 ${isActive ? 'fill-blue-400 text-blue-400' : 'text-zinc-500'}`} />
                  <span className={`text-xs truncate flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-300 group-hover:text-zinc-100'}`}>
                    {wsName}
                  </span>
                  {!isActive && workspaceNames.length > 1 && (
                    <button
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deleteWorkspace(wsName) }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* Recent */}
        {recentProjects.length > 0 && (
          <>
            <div className="px-3 py-1.5 mt-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Recent</span>
            </div>
            {recentProjects.map((project) => (
              <button key={project.path} onClick={() => openProject(project.path)}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/50 transition-colors group">
                <div className="text-xs text-zinc-300 truncate group-hover:text-zinc-100">{project.name}</div>
              </button>
            ))}
          </>
        )}

        {/* No project open prompt */}
        {!filePath && recentProjects.length === 0 && (
          <div className="px-3 py-4 text-xs text-zinc-500">
            Open or create a project to get started
          </div>
        )}
      </div>

      {/* New Workspace Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>New Workspace</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">New Workspace</div>
            <input ref={inputRef}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
              placeholder="Workspace name" value={newName}
              onChange={e => { setNewName(e.target.value); setNewError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateWorkspace(); if (e.key === 'Escape') setNewDialogOpen(false) }}
            />
            {newError && <div className="text-xs text-red-400">{newError}</div>}
            <div className="text-[11px] text-zinc-500">
              Saves current tabs as a new workspace
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200" onClick={handleCreateWorkspace}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
