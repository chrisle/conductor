import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Save, Plus, FolderOpen, Circle, MoreHorizontal, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { useProjectStore } from '@/store/project'
import {
  openProjectDialog,
  saveProject,
  saveProjectAs,
  switchWorkspace,
  addWorkspace,
  deleteWorkspace,
  renameWorkspace,
  renameProject
} from '@/lib/project-io'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'

export default function ProjectSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const {
    filePath, name,
    activeWorkspace, workspaceNames, dirtyWorkspaces,
    isAnyDirty, isWorkspaceDirty, reorderWorkspace
  } = useProjectStore()

  // Project name editing state
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Dirty confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    targetWorkspace: string
  }>({ open: false, targetWorkspace: '' })

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; workspace: string }>({ open: false, workspace: '' })
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; workspace: string }>({ open: false, workspace: '' })

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  useEffect(() => {
    if (editingName) {
      setTimeout(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      }, 50)
    }
  }, [editingName])

  useEffect(() => {
    if (renameDialog.open) {
      setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 50)
    }
  }, [renameDialog.open])

  function handleStartEditName() {
    if (!name) return
    setNameValue(name)
    setEditingName(true)
  }

  async function handleSaveName() {
    setEditingName(false)
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== name) {
      await renameProject(trimmed)
    }
    setNameValue('')
  }

  function handleCancelEditName() {
    setEditingName(false)
    setNameValue('')
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSaveName()
    if (e.key === 'Escape') handleCancelEditName()
  }

  async function handleSave() {
    if (filePath) await saveProject(filePath)
    else await saveProjectAs()
  }

  const handleSwitchWorkspace = useCallback(async (targetName: string) => {
    if (targetName === activeWorkspace) return

    // Check if current workspace is dirty
    if (isWorkspaceDirty()) {
      setConfirmDialog({ open: true, targetWorkspace: targetName })
      return
    }

    await switchWorkspace(targetName)
  }, [activeWorkspace, isWorkspaceDirty])

  async function handleConfirmSave() {
    if (filePath) await saveProject(filePath)
    else await saveProjectAs()
    await switchWorkspace(confirmDialog.targetWorkspace)
    setConfirmDialog({ open: false, targetWorkspace: '' })
  }

  async function handleConfirmDiscard() {
    useProjectStore.getState().clearWorkspaceDirty()
    await switchWorkspace(confirmDialog.targetWorkspace)
    setConfirmDialog({ open: false, targetWorkspace: '' })
  }

  function handleConfirmCancel() {
    setConfirmDialog({ open: false, targetWorkspace: '' })
  }

  async function handleCreateWorkspace() {
    await addWorkspace()
  }

  function handleStartRename(wsName: string) {
    setRenameValue(wsName)
    setRenameDialog({ open: true, workspace: wsName })
  }

  async function handleRenameSave() {
    if (renameDialog.workspace && renameValue.trim() && renameValue.trim() !== renameDialog.workspace) {
      await renameWorkspace(renameDialog.workspace, renameValue.trim())
    }
    setRenameDialog({ open: false, workspace: '' })
    setRenameValue('')
  }

  function handleRenameCancel() {
    setRenameDialog({ open: false, workspace: '' })
    setRenameValue('')
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleRenameSave()
    if (e.key === 'Escape') handleRenameCancel()
  }

  function handleStartDelete(wsName: string) {
    setDeleteDialog({ open: true, workspace: wsName })
  }

  async function handleConfirmDelete() {
    if (deleteDialog.workspace) {
      await deleteWorkspace(deleteDialog.workspace)
    }
    setDeleteDialog({ open: false, workspace: '' })
  }

  function handleCancelDelete() {
    setDeleteDialog({ open: false, workspace: '' })
  }

  // Drag handlers for workspace reordering
  function handleDragStart(e: React.DragEvent, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }

  function handleDragLeave() {
    setDropIndex(null)
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderWorkspace(dragIndex, toIndex)
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  const hasAnyDirty = isAnyDirty()

  return (
    <SidebarLayout
      title="Project"
      subtitle={<>{name || 'No project open'}{hasAnyDirty ? '*' : ''}</>}
      actions={[
        { icon: Save, label: 'Save', onClick: handleSave, disabled: !hasAnyDirty && !!filePath },
        { icon: FolderOpen, label: 'Open...', onClick: () => openProjectDialog() },
      ]}
      onSettings={name ? handleStartEditName : undefined}
    >
      {/* Workspaces */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Workspaces</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-400 hover:text-zinc-200"
          onClick={handleCreateWorkspace} title="New Workspace">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {workspaceNames.length === 0 && (
        <div className="px-3 pb-2 text-xs text-zinc-500">No workspaces</div>
      )}
      {workspaceNames.map((wsName, index) => {
        const isActive = wsName === activeWorkspace
        const isDirty = dirtyWorkspaces.has(wsName)
        const isDropTarget = dropIndex === index && dragIndex !== index
        const canDelete = workspaceNames.length > 1

        return (
          <ContextMenu key={wsName}>
            <ContextMenuTrigger asChild>
              <div
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1 px-1 py-1.5 transition-colors group ${
                  isActive ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/50 cursor-pointer'
                } ${isDropTarget ? 'border-t border-blue-500' : ''} ${
                  dragIndex === index ? 'opacity-40' : ''
                }`}
                onClick={() => !isActive && handleSwitchWorkspace(wsName)}
              >
                <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 shrink-0 hover:cursor-grab active:cursor-grabbing" />
                <Circle className={`w-2 h-2 shrink-0 ${isActive ? 'fill-blue-400 text-blue-400' : 'text-zinc-500'}`} />
                <span
                  className={`text-xs truncate flex-1 ${isActive ? 'text-zinc-200' : 'text-zinc-300 group-hover:text-zinc-100'}`}
                  onDoubleClick={(e) => { e.stopPropagation(); handleStartRename(wsName) }}
                >
                  {wsName}{isDirty ? ' *' : ''}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-zinc-900 border-zinc-700 min-w-[120px]" align="start">
                    <DropdownMenuItem className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                      onClick={() => handleStartRename(wsName)}>
                      Rename
                    </DropdownMenuItem>
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator className="bg-zinc-700" />
                        <DropdownMenuItem className="text-xs text-red-400 focus:bg-zinc-800 focus:text-red-300"
                          onClick={() => handleStartDelete(wsName)}>
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="bg-zinc-900 border-zinc-700 min-w-[140px]">
              <ContextMenuItem className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                onClick={() => handleStartRename(wsName)}>
                Rename
              </ContextMenuItem>
              {canDelete && (
                <>
                  <ContextMenuSeparator className="bg-zinc-700" />
                  <ContextMenuItem className="text-xs text-red-400 focus:bg-zinc-800 focus:text-red-300"
                    onClick={() => handleStartDelete(wsName)}>
                    Delete
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        )
      })}

      {/* No project open prompt */}
      {!name && (
        <div className="px-3 py-4 text-xs text-zinc-500">
          Open or create a project to get started
        </div>
      )}

      {/* Dirty workspace confirmation dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && handleConfirmCancel()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Unsaved Changes</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Unsaved Changes</div>
            <div className="text-xs text-zinc-400">
              You have unsaved changes in "{activeWorkspace}". What would you like to do?
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleConfirmCancel}>
              Cancel
            </Button>
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleConfirmDiscard}>
              Don't Save
            </Button>
            <Button className="text-xs bg-blue-600 hover:bg-blue-500 text-white" onClick={handleConfirmSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename workspace dialog */}
      <Dialog open={renameDialog.open} onOpenChange={(open) => !open && handleRenameCancel()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Rename Workspace</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Rename Workspace</div>
            <input
              ref={renameInputRef}
              className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              placeholder="Workspace name"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleRenameCancel}>
              Cancel
            </Button>
            <Button className="text-xs bg-blue-600 hover:bg-blue-500 text-white" onClick={handleRenameSave}
              disabled={!renameValue.trim() || renameValue.trim() === renameDialog.workspace}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename project dialog */}
      <Dialog open={editingName} onOpenChange={(open) => !open && handleCancelEditName()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Project Settings</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Project Settings</div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">Title</label>
              <input
                ref={nameInputRef}
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={handleNameKeyDown}
                placeholder="Project name"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleCancelEditName}>
              Cancel
            </Button>
            <Button className="text-xs bg-blue-600 hover:bg-blue-500 text-white" onClick={handleSaveName}
              disabled={!nameValue.trim() || nameValue.trim() === name}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete workspace confirmation dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && handleCancelDelete()}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
          <VisuallyHidden><DialogTitle>Delete Workspace</DialogTitle></VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">Delete Workspace</div>
            <div className="text-xs text-zinc-400">
              Are you sure you want to delete "{deleteDialog.workspace}"? This cannot be undone.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-xs text-zinc-400 hover:text-zinc-200" onClick={handleCancelDelete}>
              Cancel
            </Button>
            <Button className="text-xs bg-red-600 hover:bg-red-500 text-white" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarLayout>
  )
}
