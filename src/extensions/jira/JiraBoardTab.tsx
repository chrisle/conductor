import React, { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, Search, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "./KanbanBoard";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { useTabsStore } from "@/store/tabs";
import { useLayoutStore } from "@/store/layout";
import { useSidebarStore } from "@/store/sidebar";
import type { TabProps } from "../types";
import type { PendingTicket } from "./KanbanColumn";
import type { TicketStatus } from "./jira-api";
import { useSessionThinking } from "./useSessionThinking";
import { useWorkSessionsStore } from "@/store/work-sessions";
import { useProjectStore } from "@/store/project";
import {
  loadConfig,
  fetchTickets,
  fetchEpics,
  fetchDevelopmentInfo,
  createJiraTicket,
  transitionTicket,
  type Ticket,
  type Epic,
  type JiraConfig,
} from "./jira-api";

// Persistent cache so the board renders instantly on app restart (file-based via IPC)
let _boardCachePromise: Map<string, Promise<{ tickets: Ticket[]; epics: Epic[] } | null>> = new Map()

function loadBoardCache(projectKey: string): Promise<{ tickets: Ticket[]; epics: Epic[] } | null> {
  if (!_boardCachePromise.has(projectKey)) {
    _boardCachePromise.set(projectKey, window.electronAPI.loadCache('jira', projectKey))
  }
  return _boardCachePromise.get(projectKey)!
}

function saveBoardCache(projectKey: string, tickets: Ticket[], epics: Epic[]) {
  window.electronAPI.saveCache('jira', projectKey, { tickets, epics })
}

export default function JiraBoardTab({
  tabId,
  groupId,
  isActive,
  tab,
}: TabProps): React.ReactElement {
  const projectKey = tab.content || tab.title?.replace(/ Board$/, "") || "";
  const [config] = useState<JiraConfig | null>(loadConfig);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [tmuxSessions, setTmuxSessions] = useState<Set<string>>(new Set());
  const sessionThinking = useSessionThinking([...tmuxSessions]);
  const workSessions = useWorkSessionsStore(s => s.sessions);
  const [liveUpdate, setLiveUpdate] = useState(true);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pendingTickets, setPendingTickets] = useState<PendingTicket[]>([]);
  const [createDialog, setCreateDialog] = useState<{
    open: boolean;
    status: TicketStatus;
    epicKey: string | null;
  }>({
    open: false,
    status: "backlog",
    epicKey: null,
  });
  const { addTab } = useTabsStore();
  const { focusedGroupId } = useLayoutStore();
  const { rootPath } = useSidebarStore();

  // Tmux session name for a ticket — one session per ticket
  function tmuxSessionName(ticketKey: string): string {
    return `t-${ticketKey}`
  }

  const loadTmuxSessions = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:9800/api/tmux")
      if (res.ok) {
        const list: { name: string }[] = await res.json()
        setTmuxSessions(new Set(list.map((s) => s.name)))
      }
    } catch { /* conductord not running */ }
  }, [])

  const loadData = useCallback(async () => {
    if (!config || !projectKey) return;
    setLoading(true);
    setError("");
    try {
      const [ticketData, epicData] = await Promise.all([
        fetchTickets(config, projectKey),
        fetchEpics(config, projectKey),
      ]);

      const epicMap = new Map(epicData.map((e) => [e.key, e]));
      for (const t of ticketData) {
        if (t.epicKey) t.epic = epicMap.get(t.epicKey);
      }

      setTickets(ticketData);
      setEpics(epicData);
      saveBoardCache(projectKey, ticketData, epicData);
      loadTmuxSessions();

      // Fetch PRs for active tickets in background
      const activeTickets = ticketData.filter(
        (t) => t.status === "in_progress" || t.status === "done",
      );
      const prResults = await Promise.all(
        activeTickets.map(async (t) => {
          const prs = await fetchDevelopmentInfo(config, t.key);
          return { key: t.key, prs };
        }),
      );

      setTickets((prev) => {
        const prMap = new Map(prResults.map((r) => [r.key, r.prs]));
        return prev.map((t) =>
          prMap.has(t.key) ? { ...t, pullRequests: prMap.get(t.key)! } : t,
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [config, projectKey]);

  // Load cached board data for instant render, then fetch fresh data
  useEffect(() => {
    if (!config || !projectKey) return;
    loadBoardCache(projectKey).then(cached => {
      if (cached) {
        setTickets(cached.tickets);
        setEpics(cached.epics);
      }
    });
    loadData();
  }, [config, projectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live polling — refresh every 30s when enabled and tab is active
  const POLL_INTERVAL = 30
  useEffect(() => {
    if (!liveUpdate || !isActive || !config || !projectKey) {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current)
        liveIntervalRef.current = null
      }
      return
    }
    liveIntervalRef.current = setInterval(() => {
      loadData()
    }, POLL_INTERVAL * 1000)
    return () => {
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current)
        liveIntervalRef.current = null
      }
    }
  }, [liveUpdate, isActive, config, projectKey, loadData])

  const jiraBaseUrl = config
    ? `https://${config.domain.replace(/\.atlassian\.net$/, "")}.atlassian.net`
    : "";

  function openUrl(url: string, title: string) {
    const targetGroup = focusedGroupId || groupId;
    addTab(targetGroup, { type: "browser", title, url });
  }

  async function resolveWorktree(
    ticket: Ticket,
  ): Promise<{ cwd: string }> {
    const sessionsStore = useWorkSessionsStore.getState();
    const session = sessionsStore.getActiveSessionForTicket(ticket.key);

    // Already have a worktree path in an existing session
    if (session?.worktree?.path) {
      return { cwd: session.worktree.path };
    }

    // Try to find or create a worktree
    const repoPath = rootPath;
    if (repoPath) {
      const worktrees = await window.electronAPI.worktreeList(repoPath);
      const branchLower = ticket.key.toLowerCase();
      const existing = worktrees.find((wt) =>
        wt.branch.toLowerCase().includes(branchLower),
      );

      if (existing) {
        const worktree = { path: existing.path, branch: existing.branch, baseBranch: 'main' };
        if (session) {
          await sessionsStore.updateSession(session.id, { worktree });
        } else {
          await sessionsStore.createSession({
            projectPath: useProjectStore.getState().filePath || '',
            ticketKey: ticket.key,
            jiraConnectionId: '',
            worktree,
            tmuxSessionId: tmuxSessionName(ticket.key),
            claudeSessionId: null,
            prUrl: null,
            status: 'active',
          });
        }
        return { cwd: existing.path };
      }

      // Create a new worktree
      const branchName = ticket.key.toLowerCase();
      const result = await window.electronAPI.worktreeAdd(repoPath, branchName);
      if (result.success && result.path) {
        const worktree = { path: result.path, branch: branchName, baseBranch: 'main' };
        if (session) {
          await sessionsStore.updateSession(session.id, { worktree });
        } else {
          await sessionsStore.createSession({
            projectPath: useProjectStore.getState().filePath || '',
            ticketKey: ticket.key,
            jiraConnectionId: '',
            worktree,
            tmuxSessionId: tmuxSessionName(ticket.key),
            claudeSessionId: null,
            prUrl: null,
            status: 'active',
          });
        }
        return { cwd: result.path };
      }
    }

    return { cwd: rootPath || "" };
  }

  async function newSession(ticket: Ticket) {
    const targetGroup = focusedGroupId || groupId;
    const tmuxName = tmuxSessionName(ticket.key);
    const { cwd } = await resolveWorktree(ticket);
    addTab(targetGroup, {
      id: tmuxName,
      type: "claude",
      title: `Claude · ${ticket.key}`,
      filePath: cwd,
      initialCommand: `cd ${JSON.stringify(cwd)} && claude\n`,
    });
    // Refresh tmux session list after a short delay so hasSession updates
    setTimeout(loadTmuxSessions, 1500);
  }

  async function continueSession(ticket: Ticket) {
    const targetGroup = focusedGroupId || groupId;
    const tmuxName = tmuxSessionName(ticket.key);
    const { cwd } = await resolveWorktree(ticket);
    // No initialCommand — conductord will attach to the running tmux session
    addTab(targetGroup, {
      id: tmuxName,
      type: "claude",
      title: `Claude · ${ticket.key}`,
      filePath: cwd,
    });
  }

  async function startWork(ticket: Ticket) {
    const targetGroup = focusedGroupId || groupId;
    const tmuxName = tmuxSessionName(ticket.key);
    const { cwd } = await resolveWorktree(ticket);
    const prompt = `Use the claude.ai Atlassian MCP (cloud ID 8fd881b3-a07f-4662-bad9-1a9d9e0321a3) to fetch ${ticket.key} from the ${projectKey} project in ${config?.domain}. Work autonomously on this ticket end to end.`
    const escaped = prompt.replace(/'/g, "'\\''")
    addTab(targetGroup, {
      id: tmuxName,
      type: "claude",
      title: `Claude · ${ticket.key}`,
      filePath: cwd,
      initialCommand: `cd ${JSON.stringify(cwd)} && claude --dangerously-skip-permissions '${escaped}'\n`,
      autoPilot: true,
    });
    setTimeout(loadTmuxSessions, 1500);
    // Auto-transition ticket to "In Progress" in Jira
    if (config && ticket.status === 'backlog') {
      transitionTicket(config, ticket.key, 'In Progress').catch(() => {})
    }
  }

  function handleOpenCreateDialog(
    status: TicketStatus,
    epicKey: string | null,
  ) {
    setCreateDialog({ open: true, status, epicKey });
  }

  async function handleCreateTicket(description: string) {
    if (!config) return;

    const { status, epicKey } = createDialog;
    const tempId = `pending-${Date.now()}`;

    // Add skeleton
    setPendingTickets((prev) => [...prev, { tempId, status, epicKey }]);

    try {
      // Get epic summary for context
      const epic = epicKey ? epics.find((e) => e.key === epicKey) : null;

      // Use Claude CLI to generate the ticket content
      const generated = await window.electronAPI.generateTicket(
        description,
        projectKey,
        epic?.summary,
      );

      if (!generated.success) {
        throw new Error(generated.error || "Claude failed to generate ticket");
      }

      // Create the ticket in Jira
      const newTicket = await createJiraTicket(config, {
        projectKey,
        summary: generated.summary!,
        description: generated.description!,
        issueType: generated.issueType,
        epicKey,
        status,
      });

      // Attach epic reference if available
      if (epic) newTicket.epic = epic;

      // Replace skeleton with real ticket
      setPendingTickets((prev) => prev.filter((p) => p.tempId !== tempId));
      setTickets((prev) => [...prev, newTicket]);
    } catch (err) {
      setPendingTickets((prev) => prev.filter((p) => p.tempId !== tempId));
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    }
  }

  const filteredTickets = filter
    ? tickets.filter(
        (t) =>
          t.key.toLowerCase().includes(filter.toLowerCase()) ||
          t.summary.toLowerCase().includes(filter.toLowerCase()),
      )
    : tickets;

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Jira not configured. Open the Jira sidebar to connect.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700/50 shrink-0">
        <span className="text-sm font-semibold text-zinc-100">
          {projectKey}
        </span>
        <span className="text-xs text-zinc-400">{tickets.length} tickets</span>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
            <input
              className="h-7 w-48 rounded bg-zinc-800/50 border border-zinc-600/50 pl-7 pr-2 text-xs text-zinc-200 outline-none focus:border-blue-500/60 placeholder-zinc-500"
              placeholder="Filter tickets..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <button
            onClick={() => setLiveUpdate(!liveUpdate)}
            className={`flex items-center gap-1 h-7 rounded px-2 text-[11px] transition-colors ${
              liveUpdate
                ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
            }`}
            title={liveUpdate ? 'Live updates on' : 'Enable live updates'}
          >
            <Radio className={`w-3 h-3 ${liveUpdate ? 'animate-pulse' : ''}`} />
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
            onClick={loadData}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between px-4 py-2 text-xs text-red-400 bg-red-950/30 border-b border-red-900/50">
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-2 hover:text-red-300 shrink-0"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <KanbanBoard
        tickets={filteredTickets}
        epics={epics}
        config={config}
        jiraBaseUrl={jiraBaseUrl}
        pendingTickets={pendingTickets}
        tmuxSessions={tmuxSessions}
        sessionThinking={sessionThinking}
        workSessions={workSessions}
        onOpenUrl={openUrl}
        onNewSession={newSession}
        onContinueSession={continueSession}
        onStartWork={startWork}
        onRefresh={loadData}
        onCreateTicket={handleOpenCreateDialog}
      />

      <CreateTicketDialog
        open={createDialog.open}
        onOpenChange={(open) => setCreateDialog((prev) => ({ ...prev, open }))}
        columnTitle={
          createDialog.status === "backlog"
            ? "Backlog"
            : createDialog.status === "in_progress"
              ? "In Progress"
              : "Done"
        }
        onSubmit={handleCreateTicket}
      />
    </div>
  );
}
