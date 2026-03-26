import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw, EyeOff, Eye, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from './KanbanBoard'
import { CreateTicketDialog } from './CreateTicketDialog'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import type { TabProps } from '../types'
import type { PendingTicket } from './KanbanColumn'
import type { TicketStatus } from './jira-api'
import {
  loadConfig,
  fetchTickets,
  fetchEpics,
  fetchDevelopmentInfo,
  createJiraTicket,
  type Ticket,
  type Epic,
  type JiraConfig,
} from './jira-api'

export default function JiraBoardTab({ tabId, groupId, isActive, tab }: TabProps): React.ReactElement {
  const [config] = useState<JiraConfig | null>(loadConfig)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hideDone, setHideDone] = useState(true)
  const [filter, setFilter] = useState('')
  const [pendingTickets, setPendingTickets] = useState<PendingTicket[]>([])
  const [createDialog, setCreateDialog] = useState<{ open: boolean; status: TicketStatus; epicKey: string | null }>({
    open: false, status: 'backlog', epicKey: null,
  })
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()

  // tab.content holds the project key; fall back to title for old saved files
  const projectKey = tab.content || tab.title?.replace(/ Board$/, '') || ''

  const loadData = useCallback(async () => {
    if (!config || !projectKey) return
    setLoading(true)
    setError('')
    try {
      const [ticketData, epicData] = await Promise.all([
        fetchTickets(config, projectKey),
        fetchEpics(config, projectKey),
      ])

      const epicMap = new Map(epicData.map(e => [e.key, e]))
      for (const t of ticketData) {
        if (t.epicKey) t.epic = epicMap.get(t.epicKey)
      }

      setTickets(ticketData)
      setEpics(epicData)

      // Fetch PRs for active tickets in background
      const activeTickets = ticketData.filter(t => t.status === 'in_progress' || t.status === 'verify' || t.status === 'done')
      const prResults = await Promise.all(
        activeTickets.map(async (t) => {
          const prs = await fetchDevelopmentInfo(config, t.key)
          return { key: t.key, prs }
        })
      )

      setTickets(prev => {
        const prMap = new Map(prResults.map(r => [r.key, r.prs]))
        return prev.map(t => prMap.has(t.key) ? { ...t, pullRequests: prMap.get(t.key)! } : t)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [config, projectKey])

  useEffect(() => {
    if (config && projectKey) {
      loadData()
    }
  }, [config, projectKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const jiraBaseUrl = config ? `https://${config.domain.replace(/\.atlassian\.net$/, '')}.atlassian.net` : ''

  function openUrl(url: string, title: string) {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'browser', title, url })
  }

  async function openClaude(ticket: Ticket) {
    const targetGroup = focusedGroupId || groupId
    const binding = await window.electronAPI.getTicketBinding(ticket.key)
    const cwd = binding?.worktree_path || rootPath || undefined
    addTab(targetGroup, {
      type: 'claude',
      title: `Claude · ${ticket.key}`,
      filePath: cwd,
      initialCommand: binding?.claude_session_id ? `claude --resume ${binding.claude_session_id}\n` : undefined,
    })
  }

  async function beginWork(ticket: Ticket) {
    const targetGroup = focusedGroupId || groupId
    const binding = await window.electronAPI.getTicketBinding(ticket.key)
    const cwd = binding?.worktree_path || rootPath || undefined
    if (binding?.claude_session_id) {
      addTab(targetGroup, {
        type: 'claude',
        title: `Claude · ${ticket.key}`,
        filePath: cwd,
        initialCommand: `claude --resume ${binding.claude_session_id}\n`,
      })
    } else {
      const prompt = `Use the claude.ai Atlassian MCP (cloud ID 8fd881b3-a07f-4662-bad9-1a9d9e0321a3) to fetch ${ticket.key} from the ${projectKey} space in ${config?.domain}.atlassian.net. Work autonomously on this ticket. Use opus for planning mode and sonnet for implementation.`
      addTab(targetGroup, {
        type: 'claude',
        title: `Claude · ${ticket.key}`,
        filePath: cwd,
        initialCommand: `claude "${prompt}"\n`,
      })
    }
  }

  function handleOpenCreateDialog(status: TicketStatus, epicKey: string | null) {
    setCreateDialog({ open: true, status, epicKey })
  }

  async function handleCreateTicket(description: string) {
    if (!config) return

    const { status, epicKey } = createDialog
    const tempId = `pending-${Date.now()}`

    // Add skeleton
    setPendingTickets(prev => [...prev, { tempId, status, epicKey }])

    try {
      // Get epic summary for context
      const epic = epicKey ? epics.find(e => e.key === epicKey) : null

      // Use Claude CLI to generate the ticket content
      const generated = await window.electronAPI.generateTicket(description, projectKey, epic?.summary)

      if (!generated.success) {
        throw new Error(generated.error || 'Claude failed to generate ticket')
      }

      // Create the ticket in Jira
      const newTicket = await createJiraTicket(config, {
        projectKey,
        summary: generated.summary!,
        description: generated.description!,
        issueType: generated.issueType,
        epicKey,
        status,
      })

      // Attach epic reference if available
      if (epic) newTicket.epic = epic

      // Replace skeleton with real ticket
      setPendingTickets(prev => prev.filter(p => p.tempId !== tempId))
      setTickets(prev => [...prev, newTicket])
    } catch (err) {
      setPendingTickets(prev => prev.filter(p => p.tempId !== tempId))
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
    }
  }

  const filteredTickets = filter
    ? tickets.filter(t =>
        t.key.toLowerCase().includes(filter.toLowerCase()) ||
        t.summary.toLowerCase().includes(filter.toLowerCase())
      )
    : tickets

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Jira not configured. Open the Jira sidebar to connect.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700/50 shrink-0">
        <span className="text-sm font-semibold text-zinc-100">{projectKey}</span>
        <span className="text-xs text-zinc-400">{tickets.length} tickets</span>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
            <input
              className="h-7 w-48 rounded bg-zinc-800/50 border border-zinc-600/50 pl-7 pr-2 text-xs text-zinc-200 outline-none focus:border-blue-500/60 placeholder-zinc-500"
              placeholder="Filter tickets..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            onClick={() => setHideDone(!hideDone)}
            title={hideDone ? 'Show Done' : 'Hide Done'}
          >
            {hideDone ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            onClick={loadData}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between px-4 py-2 text-xs text-red-400 bg-red-950/30 border-b border-red-900/50">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 hover:text-red-300 shrink-0" title="Dismiss">✕</button>
        </div>
      )}

      {loading && tickets.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <RefreshCw className="w-5 h-5 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <KanbanBoard
          tickets={filteredTickets}
          epics={epics}
          config={config}
          hideDone={hideDone}
          jiraBaseUrl={jiraBaseUrl}
          pendingTickets={pendingTickets}
          onOpenUrl={openUrl}
          onOpenClaude={openClaude}
          onBeginWork={beginWork}
          onRefresh={loadData}
          onCreateTicket={handleOpenCreateDialog}
        />
      )}

      <CreateTicketDialog
        open={createDialog.open}
        onOpenChange={(open) => setCreateDialog(prev => ({ ...prev, open }))}
        columnTitle={
          createDialog.status === 'backlog' ? 'Backlog'
          : createDialog.status === 'in_progress' ? 'In Progress'
          : createDialog.status === 'verify' ? 'Verify'
          : 'Done'
        }
        onSubmit={handleCreateTicket}
      />
    </div>
  )
}
