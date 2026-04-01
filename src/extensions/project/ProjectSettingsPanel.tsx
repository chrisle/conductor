import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/store/project'
import { useSidebarStore } from '@/store/sidebar'
import { renameProject } from '@/lib/project-io'

export default function ProjectSettingsPanel(): React.ReactElement {
  const projectName = useProjectStore(s => s.name)
  const filePath = useProjectStore(s => s.filePath)
  const rootPath = useSidebarStore(s => s.rootPath)

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(projectName || '')

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== projectName) {
      await renameProject(nameValue.trim())
    }
    setEditingName(false)
  }

  return (
    <div className="space-y-4">
      {/* General */}
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-ui-sm text-zinc-400 font-medium">Name</label>
          {editingName ? (
            <div className="flex gap-1.5">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-ui-base text-zinc-200 outline-none focus:border-blue-500"
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                autoFocus
              />
              <Button size="sm" className="text-ui-base h-6 px-2" onClick={handleSaveName}>Save</Button>
              <Button size="sm" variant="ghost" className="text-ui-base h-6 px-2" onClick={() => setEditingName(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-ui-base text-zinc-200">{projectName || 'Untitled'}</span>
              <button
                onClick={() => { setNameValue(projectName || ''); setEditingName(true) }}
                className="text-ui-xs text-zinc-500 hover:text-zinc-300"
              >
                edit
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-ui-sm text-zinc-400 font-medium">Project Root</label>
          <div className="flex items-center gap-2">
            <span className="text-ui-xs text-zinc-500 truncate flex-1">{rootPath || 'Not set'}</span>
            <button
              onClick={async () => {
                const dir = await window.electronAPI.selectDirectory()
                if (dir) useSidebarStore.getState().setRootPath(dir)
              }}
              className="text-ui-xs text-blue-400 hover:text-blue-300 shrink-0"
            >
              Change
            </button>
          </div>
        </div>

        {filePath && (
          <div className="space-y-1">
            <label className="text-ui-sm text-zinc-400 font-medium">Project File</label>
            <span className="text-ui-xs text-zinc-500 block truncate">{filePath}</span>
          </div>
        )}
      </div>
    </div>
  )
}
