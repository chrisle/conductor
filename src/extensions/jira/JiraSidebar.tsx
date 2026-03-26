import React, { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, LogOut, ChevronRight, Globe, ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import {
  type JiraConfig,
  type JiraProject,
  loadConfig,
  saveConfig,
  clearConfig,
  fetchProjects,
  projectBoardUrl,
} from './jira-api'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'

function ConfigForm({ onSave }: { onSave: (c: JiraConfig) => void }) {
  const [domain, setDomain] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const config: JiraConfig = { domain: domain.trim(), email: email.trim(), apiToken: apiToken.trim() }
    if (!config.domain || !config.email || !config.apiToken) {
      setError('All fields are required')
      return
    }
    setTesting(true)
    setError('')
    try {
      await fetchProjects(config)
      saveConfig(config)
      onSave(config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 space-y-3">
      <div className="text-xs text-zinc-400">Connect to your Jira instance</div>
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="Domain (e.g. mycompany)"
        value={domain}
        onChange={e => setDomain(e.target.value)}
      />
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="API Token"
        value={apiToken}
        onChange={e => setApiToken(e.target.value)}
      />
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={testing}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded py-1.5 transition-colors"
      >
        {testing ? 'Connecting...' : 'Connect'}
      </button>
      <div className="text-[10px] text-zinc-500 leading-relaxed">
        Create an API token at{' '}
        <span className="text-zinc-400">id.atlassian.com/manage-profile/security/api-tokens</span>
      </div>
    </form>
  )
}

export default function JiraSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const [config, setConfig] = useState<JiraConfig | null>(loadConfig)
  const [projects, setProjects] = useState<JiraProject[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const { addTab, setActiveTab, groups } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const filterRef = useRef<HTMLInputElement>(null)

  const loadProjects = useCallback(async () => {
    if (!config) return
    setLoading(true)
    setError('')
    try {
      const result = await fetchProjects(config)
      setProjects(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    if (config) loadProjects()
  }, [config, loadProjects])

  function openBoard(project: JiraProject, forceNew = false) {
    if (!config) return
    const targetGroup = focusedGroupId || groupId

    // Focus existing tab if one is already open for this project
    if (!forceNew) {
      const group = groups[targetGroup]
      if (group) {
        const existing = group.tabs.find(
          t => t.type === 'jira-board' && t.content === project.key
        )
        if (existing) {
          setActiveTab(targetGroup, existing.id)
          return
        }
      }
    }

    addTab(targetGroup, {
      type: 'jira-board',
      title: `${project.key} Board`,
      content: project.key,
    })
  }

  function openInConductorBrowser(project: JiraProject) {
    if (!config) return
    const url = projectBoardUrl(config, project)
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'browser', title: `${project.key} - Jira`, url })
  }

  function openInSystemBrowser(project: JiraProject) {
    if (!config) return
    window.open(projectBoardUrl(config, project))
  }

  function handleDisconnect() {
    clearConfig()
    setConfig(null)
    setProjects([])
  }

  if (!config) {
    return (
      <SidebarLayout title="Jira">
        <ConfigForm onSave={setConfig} />
      </SidebarLayout>
    )
  }

  const filtered = filter
    ? projects.filter(
        p =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          p.key.toLowerCase().includes(filter.toLowerCase())
      )
    : projects

  // Group by projectTypeKey
  const grouped = new Map<string, JiraProject[]>()
  for (const p of filtered) {
    const type = p.projectTypeKey
    if (!grouped.has(type)) grouped.set(type, [])
    grouped.get(type)!.push(p)
  }

  const typeLabels: Record<string, string> = {
    software: 'Software',
    service_desk: 'Service Desk',
    business: 'Business',
  }

  return (
    <SidebarLayout
      title="Jira"
      actions={[
        { icon: RefreshCw, label: 'Refresh', onClick: loadProjects, disabled: loading, spinning: loading },
        { icon: LogOut, label: 'Disconnect', onClick: handleDisconnect, className: 'text-zinc-500 hover:text-red-400' },
      ]}
      footer={config.domain.replace(/\.atlassian\.net$/, '') + '.atlassian.net'}
    >
      {/* Filter */}
      {projects.length > 5 && (
        <div className="px-3 py-1.5 border-b border-zinc-700/40">
          <input
            ref={filterRef}
            className="w-full bg-zinc-800/50 border border-zinc-600/50 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500/60 placeholder-zinc-500"
            placeholder="Filter projects..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
      )}

      {/* Project list */}
      {error && (
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-red-400 bg-red-950/30">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 hover:text-red-300" title="Dismiss">✕</button>
        </div>
      )}

      {loading && projects.length === 0 && (
        <div className="px-3 py-4 text-xs text-zinc-500">Loading projects...</div>
      )}

      {!loading && projects.length === 0 && !error && (
        <div className="px-3 py-4 text-xs text-zinc-500">No projects found</div>
      )}

      {[...grouped.entries()].map(([type, typeProjects]) => (
        <ProjectGroup
          key={type}
          label={typeLabels[type] || type}
          projects={typeProjects}
          onOpen={openBoard}
          onOpenInConductor={openInConductorBrowser}
          onOpenInSystemBrowser={openInSystemBrowser}
          onOpenNewTab={(p) => openBoard(p, true)}
        />
      ))}
    </SidebarLayout>
  )
}

function ProjectGroup({
  label,
  projects,
  onOpen,
  onOpenInConductor,
  onOpenInSystemBrowser,
  onOpenNewTab,
}: {
  label: string
  projects: JiraProject[]
  onOpen: (p: JiraProject) => void
  onOpenInConductor: (p: JiraProject) => void
  onOpenInSystemBrowser: (p: JiraProject) => void
  onOpenNewTab: (p: JiraProject) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div>
      <button
        className="w-full flex items-center gap-1 px-3 py-1.5 text-left hover:bg-zinc-800/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronRight
          className={`w-3 h-3 text-zinc-500 transition-transform ${collapsed ? '' : 'rotate-90'}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <span className="text-[10px] text-zinc-500 ml-auto">{projects.length}</span>
      </button>
      {!collapsed &&
        projects.map(project => (
          <ContextMenu key={project.id}>
            <ContextMenuTrigger asChild>
              <button
                onClick={() => onOpen(project)}
                className="w-full text-left px-3 py-1.5 pl-7 hover:bg-zinc-800/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  {project.avatarUrl && (
                    <img
                      src={project.avatarUrl}
                      alt=""
                      className="w-4 h-4 rounded-sm shrink-0"
                    />
                  )}
                  <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">
                    {project.name}
                  </span>
                  <span className="text-[10px] text-zinc-500 shrink-0 ml-auto">
                    {project.key}
                  </span>
                </div>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onOpenInConductor(project)}>
                <Globe className="w-3.5 h-3.5 mr-2" />
                Open in Conductor
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onOpenInSystemBrowser(project)}>
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                Open in System Browser
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onOpenNewTab(project)}>
                <Plus className="w-3.5 h-3.5 mr-2" />
                Open in New Tab
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
    </div>
  )
}
