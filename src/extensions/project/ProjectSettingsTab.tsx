import React, { useState } from 'react'
import { Settings, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useProjectStore } from '@/store/project'
import { useConfigStore } from '@/store/config'
import { useSidebarStore } from '@/store/sidebar'
import { renameProject } from '@/lib/project-io'
import { useResolvedSettings } from '@/hooks/useResolvedSettings'
import { DEFAULT_PROJECT_SETTINGS } from '@/types/project-settings'
import type { TabProps } from '../types'

export default function ProjectSettingsTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const projectName = useProjectStore(s => s.name)
  const filePath = useProjectStore(s => s.filePath)
  const jiraSpaceKeys = useProjectStore(s => s.jiraSpaceKeys)
  const jiraConnectionId = useProjectStore(s => s.jiraConnectionId)
  const { setJiraConfig } = useProjectStore.getState()
  const jiraConnections = useConfigStore(s => s.config.jiraConnections)
  const rootPath = useSidebarStore(s => s.rootPath)
  const projectSettings = useProjectStore(s => s.projectSettings)
  const workspaceSettings = useProjectStore(s => s.workspaceSettings)
  const activeWorkspace = useProjectStore(s => s.activeWorkspace)
  const { setProjectSettings, setWorkspaceSettings } = useProjectStore.getState()
  const resolved = useResolvedSettings()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(projectName || '')
  const [spaceKeyInput, setSpaceKeyInput] = useState('')

  const handleSaveName = async () => {
    if (nameValue.trim() && nameValue !== projectName) {
      await renameProject(nameValue.trim())
    }
    setEditingName(false)
  }

  const addSpaceKey = () => {
    const key = spaceKeyInput.trim().toUpperCase()
    if (key && !jiraSpaceKeys.includes(key)) {
      setJiraConfig([...jiraSpaceKeys, key], jiraConnectionId ?? undefined)
    }
    setSpaceKeyInput('')
  }

  const removeSpaceKey = (key: string) => {
    setJiraConfig(jiraSpaceKeys.filter(k => k !== key), jiraConnectionId ?? undefined)
  }

  const setConnection = (connectionId: string) => {
    setJiraConfig(jiraSpaceKeys, connectionId || undefined)
  }

  return (
    <div className="h-full overflow-auto bg-zinc-950 text-zinc-300">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-4 h-4 text-zinc-500" />
          <h1 className="text-sm font-semibold text-zinc-200">Project Settings</h1>
        </div>

        {/* Project Info */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">General</h2>
          <Separator className="bg-zinc-800" />

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                />
                <Button size="sm" className="text-xs h-7" onClick={handleSaveName}>Save</Button>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setEditingName(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-200">{projectName || 'Untitled'}</span>
                <button
                  onClick={() => { setNameValue(projectName || ''); setEditingName(true) }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  edit
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Project Root</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 truncate flex-1">{rootPath || 'Not set'}</span>
              <button
                onClick={async () => {
                  const dir = await window.electronAPI.selectDirectory()
                  if (dir) useSidebarStore.getState().setRootPath(dir)
                }}
                className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0"
              >
                Change
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Project File</label>
            <span className="text-xs text-zinc-500 block truncate">{filePath || 'Unsaved'}</span>
          </div>
        </section>

        {/* Jira Integration */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Jira Integration</h2>
          <Separator className="bg-zinc-800" />

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Connection</label>
            {jiraConnections.length > 0 ? (
              <select
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500"
                value={jiraConnectionId || ''}
                onChange={e => setConnection(e.target.value)}
              >
                <option value="">Select connection...</option>
                {jiraConnections.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.domain})</option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-zinc-500 block">
                No Jira connections configured. Add one in the Jira sidebar settings.
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 font-medium">Linked Spaces</label>
            <div className="text-[10px] text-zinc-500 mb-1">
              Jira project keys that will be pinned in the sidebar for this project.
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {jiraSpaceKeys.map(key => (
                <Badge key={key} variant="secondary" className="text-[10px] gap-1 bg-blue-900/30 text-blue-400 border-blue-800/50">
                  {key}
                  <button onClick={() => removeSpaceKey(key)} className="hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 placeholder-zinc-500"
                placeholder="Project key (e.g. COND)"
                value={spaceKeyInput}
                onChange={e => setSpaceKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSpaceKey()}
              />
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={addSpaceKey}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
          </div>
        </section>

        {/* Terminal Settings */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Terminal</h2>
          <Separator className="bg-zinc-800" />

          {/* tmux Mouse */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] text-zinc-400 font-medium">tmux Mouse Scrolling</label>
                <div className="text-[10px] text-zinc-500">
                  Use mouse wheel for scrollback instead of arrow keys
                </div>
              </div>
            </div>

            {/* Project-level */}
            <div className="flex items-center justify-between bg-zinc-900/50 rounded px-2.5 py-1.5">
              <span className="text-[10px] text-zinc-400">Project default</span>
              <select
                className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-blue-500"
                value={projectSettings?.terminal?.tmuxMouse === undefined ? '__default__' : String(projectSettings.terminal.tmuxMouse)}
                onChange={e => {
                  const val = e.target.value
                  if (val === '__default__') {
                    // Remove project override
                    const { terminal: _, ...rest } = projectSettings ?? {}
                    setProjectSettings(Object.keys(rest).length > 0 ? rest : undefined)
                  } else {
                    setProjectSettings({
                      ...projectSettings,
                      terminal: { ...projectSettings?.terminal, tmuxMouse: val === 'true' },
                    })
                  }
                }}
              >
                <option value="__default__">Default ({DEFAULT_PROJECT_SETTINGS.terminal.tmuxMouse ? 'On' : 'Off'})</option>
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            </div>

            {/* Workspace-level */}
            <div className="flex items-center justify-between bg-zinc-900/50 rounded px-2.5 py-1.5">
              <span className="text-[10px] text-zinc-400">Workspace override{activeWorkspace ? ` (${activeWorkspace})` : ''}</span>
              <select
                className="bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 outline-none focus:border-blue-500"
                value={workspaceSettings?.terminal?.tmuxMouse === undefined ? '__inherit__' : String(workspaceSettings.terminal.tmuxMouse)}
                onChange={e => {
                  const val = e.target.value
                  if (val === '__inherit__') {
                    // Remove workspace override
                    const { terminal: _, ...rest } = workspaceSettings ?? {}
                    setWorkspaceSettings(Object.keys(rest).length > 0 ? rest : undefined)
                  } else {
                    setWorkspaceSettings({
                      ...workspaceSettings,
                      terminal: { ...workspaceSettings?.terminal, tmuxMouse: val === 'true' },
                    })
                  }
                }}
              >
                <option value="__inherit__">Inherit from project</option>
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            </div>

            <div className="text-[10px] text-zinc-600">
              Effective: <span className="text-zinc-400">{resolved.terminal.tmuxMouse ? 'On' : 'Off'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
