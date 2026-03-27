import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  ChevronRight,
  Globe,
  ExternalLink,
  Plus,
  X,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionThinking } from "./useSessionThinking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useTabsStore } from "@/store/tabs";
import { useLayoutStore } from "@/store/layout";
import { useSidebarStore } from "@/store/sidebar";
import {
  type JiraConfig,
  type JiraProject,
  loadConfig,
  saveConfig,
  fetchProjects,
  projectBoardUrl,
} from "./jira-api";
import SidebarLayout from "@/components/Sidebar/SidebarLayout";

// Module-level cache so projects survive sidebar unmount/remount
let cachedProjects: JiraProject[] | null = null;

function ConfigForm({ onSave }: { onSave: (c: JiraConfig) => void }) {
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const config: JiraConfig = {
      domain: domain.trim(),
      email: email.trim(),
      apiToken: apiToken.trim(),
    };
    if (!config.domain || !config.email || !config.apiToken) {
      setError("All fields are required");
      return;
    }
    setTesting(true);
    setError("");
    try {
      await fetchProjects(config);
      saveConfig(config);
      onSave(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 space-y-3">
      <div className="text-xs text-zinc-400">Connect to your Jira instance</div>
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="Domain (e.g. mycompany)"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
      />
      <input
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-500 placeholder-zinc-500"
        placeholder="API Token"
        value={apiToken}
        onChange={(e) => setApiToken(e.target.value)}
      />
      {error && <div className="text-[11px] text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={testing}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded py-1.5 transition-colors"
      >
        {testing ? "Connecting..." : "Connect"}
      </button>
      <div className="text-[10px] text-zinc-500 leading-relaxed">
        Create an API token at{" "}
        <span className="text-zinc-400">
          id.atlassian.com/manage-profile/security/api-tokens
        </span>
      </div>
    </form>
  );
}

export default function JiraSidebar({
  groupId,
}: {
  groupId: string;
}): React.ReactElement {
  const [config, setConfig] = useState<JiraConfig | null>(loadConfig);
  const [projects, setProjects] = useState<JiraProject[]>(cachedProjects || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    domain: "",
    email: "",
    apiToken: "",
  });
  const [settingsTesting, setSettingsTesting] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [tmuxSessions, setTmuxSessions] = useState<string[]>([]);
  const [killConfirm, setKillConfirm] = useState<string | null>(null);
  const { addTab, setActiveTab, groups } = useTabsStore(); // groups used for existing-tab focus check
  const { focusedGroupId } = useLayoutStore();
  const { rootPath } = useSidebarStore();

  // Per-session thinking state — works whether the tab is open or closed.
  const sessionThinking = useSessionThinking(tmuxSessions);
  const filterRef = useRef<HTMLInputElement>(null);

  const loadTmuxSessions = useCallback(async () => {
    try {
      const res = await fetch("http://127.0.0.1:9800/api/tmux");
      if (res.ok) {
        const list: { name: string }[] = await res.json();
        setTmuxSessions(list.map((s) => s.name));
      }
    } catch {
      /* conductord not running */
    }
  }, []);

  async function killTmuxSession(name: string) {
    try {
      await fetch(`http://127.0.0.1:9800/api/tmux/${name}`, {
        method: "DELETE",
      });
      setTmuxSessions((prev) => prev.filter((s) => s !== name));
    } catch {
      /* ignore */
    }
    setKillConfirm(null);
  }

  function openSession(name: string) {
    // Focus the tab if it already exists in any group
    for (const [gId, group] of Object.entries(groups)) {
      const existing = group.tabs.find((t) => t.id === name);
      if (existing) {
        setActiveTab(gId, name);
        return;
      }
    }
    // Otherwise open a new claude tab that attaches to the running tmux session
    const targetGroup = focusedGroupId || groupId;
    // Derive a friendly title: "t-NP3-130" → "Claude · NP3-130"
    const ticketKey = name.replace(/^t-/, "");
    addTab(targetGroup, {
      id: name,
      type: "claude",
      title: `Claude · ${ticketKey}`,
      filePath: rootPath || "",
      // No initialCommand — conductord attaches to the existing session
    });
  }

  useEffect(() => {
    loadTmuxSessions();
  }, []);

  const loadProjects = useCallback(
    async (force = false) => {
      if (!config) return;
      if (!force && cachedProjects) return;
      setLoading(true);
      setError("");
      try {
        const result = await fetchProjects(config);
        cachedProjects = result;
        setProjects(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [config],
  );

  useEffect(() => {
    if (config) loadProjects();
  }, [config, loadProjects]);

  function openBoard(project: JiraProject, forceNew = false) {
    if (!config) return;
    const targetGroup = focusedGroupId || groupId;

    // Focus existing tab if one is already open for this project
    if (!forceNew) {
      const group = groups[targetGroup];
      if (group) {
        const existing = group.tabs.find(
          (t) => t.type === "jira-board" && t.content === project.key,
        );
        if (existing) {
          setActiveTab(targetGroup, existing.id);
          return;
        }
      }
    }

    addTab(targetGroup, {
      type: "jira-board",
      title: `${project.key} Board`,
      content: project.key,
    });
  }

  function openInConductorBrowser(project: JiraProject) {
    if (!config) return;
    const url = projectBoardUrl(config, project);
    const targetGroup = focusedGroupId || groupId;
    addTab(targetGroup, {
      type: "browser",
      title: `${project.key} - Jira`,
      url,
    });
  }

  function openInSystemBrowser(project: JiraProject) {
    if (!config) return;
    window.open(projectBoardUrl(config, project));
  }

  function handleOpenSettings() {
    setSettingsForm({
      domain: config?.domain || "",
      email: config?.email || "",
      apiToken: config?.apiToken || "",
    });
    setSettingsError("");
    setSettingsOpen(true);
  }

  async function handleSaveSettings() {
    const newConfig: JiraConfig = {
      domain: settingsForm.domain.trim(),
      email: settingsForm.email.trim(),
      apiToken: settingsForm.apiToken.trim(),
    };
    if (!newConfig.domain || !newConfig.email || !newConfig.apiToken) {
      setSettingsError("All fields are required");
      return;
    }
    setSettingsTesting(true);
    setSettingsError("");
    try {
      await fetchProjects(newConfig);
      saveConfig(newConfig);
      cachedProjects = null;
      setConfig(newConfig);
      setSettingsOpen(false);
      loadProjects(true);
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : "Connection failed",
      );
    } finally {
      setSettingsTesting(false);
    }
  }

  if (!config) {
    return (
      <SidebarLayout title="Jira">
        <ConfigForm onSave={setConfig} />
      </SidebarLayout>
    );
  }

  const filtered = filter
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(filter.toLowerCase()) ||
          p.key.toLowerCase().includes(filter.toLowerCase()),
      )
    : projects;

  // Group by projectTypeKey
  const grouped = new Map<string, JiraProject[]>();
  for (const p of filtered) {
    const type = p.projectTypeKey;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(p);
  }

  const typeLabels: Record<string, string> = {
    software: "Software",
    service_desk: "Service Desk",
    business: "Business",
  };

  return (
    <SidebarLayout
      title="Jira"
      actions={[
        {
          icon: RefreshCw,
          label: "Refresh",
          onClick: () => loadProjects(true),
          disabled: loading,
          spinning: loading,
        },
      ]}
      onSettings={handleOpenSettings}
      footer={config.domain.replace(/\.atlassian\.net$/, "") + ".atlassian.net"}
    >
      {/* Filter */}
      {projects.length > 5 && (
        <div className="px-3 py-1.5 border-b border-zinc-700/40">
          <input
            ref={filterRef}
            className="w-full bg-zinc-800/50 border border-zinc-600/50 rounded px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500/60 placeholder-zinc-500"
            placeholder="Filter projects..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      {/* Project list */}
      {error && (
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-red-400 bg-red-950/30">
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-2 hover:text-red-300"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {loading && projects.length === 0 && (
        <div className="px-3 py-4 text-xs text-zinc-500">
          Loading projects...
        </div>
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

      {/* Active tmux sessions */}
      <div className="border-t border-zinc-800/60 mt-1" />
      <SessionsGroup
        sessions={tmuxSessions}
        sessionThinking={sessionThinking}
        onOpen={openSession}
        onKill={setKillConfirm}
        onRefresh={loadTmuxSessions}
      />

      {/* Kill session confirmation */}
      <Dialog
        open={killConfirm !== null}
        onOpenChange={(open) => !open && setKillConfirm(null)}
      >
        <DialogContent
          className="bg-zinc-900 border-zinc-700 max-w-xs"
          hideClose
        >
          <VisuallyHidden>
            <DialogTitle>Kill Session</DialogTitle>
          </VisuallyHidden>
          <div className="space-y-2">
            <div className="text-sm font-medium text-zinc-200">
              Kill session?
            </div>
            <div className="text-xs text-zinc-400">
              <span className="font-mono text-zinc-300">{killConfirm}</span>{" "}
              will be terminated. Any running process inside it will be lost.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="text-xs text-zinc-400 hover:text-zinc-200"
              onClick={() => setKillConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              className="text-xs bg-red-700 hover:bg-red-600 text-white"
              onClick={() => killConfirm && killTmuxSession(killConfirm)}
            >
              Kill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings dialog */}
      <Dialog
        open={settingsOpen}
        onOpenChange={(open) => !open && setSettingsOpen(false)}
      >
        <DialogContent
          className="bg-zinc-900 border-zinc-700 max-w-sm"
          hideClose
        >
          <VisuallyHidden>
            <DialogTitle>Jira Settings</DialogTitle>
          </VisuallyHidden>
          <div className="space-y-3">
            <div className="text-sm text-zinc-300 font-medium">
              Jira Settings
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">
                Domain
              </label>
              <input
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 placeholder-zinc-500"
                placeholder="e.g. mycompany"
                value={settingsForm.domain}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, domain: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">
                Email
              </label>
              <input
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 placeholder-zinc-500"
                placeholder="you@example.com"
                value={settingsForm.email}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-medium">
                API Token
              </label>
              <input
                type="password"
                className="w-full bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 placeholder-zinc-500"
                placeholder="API token"
                value={settingsForm.apiToken}
                onChange={(e) =>
                  setSettingsForm((f) => ({ ...f, apiToken: e.target.value }))
                }
              />
            </div>
            {settingsError && (
              <div className="text-[11px] text-red-400">{settingsError}</div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="text-xs text-zinc-400 hover:text-zinc-200"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white"
              onClick={handleSaveSettings}
              disabled={settingsTesting}
            >
              {settingsTesting ? "Testing..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarLayout>
  );
}

function ProjectGroup({
  label,
  projects,
  onOpen,
  onOpenInConductor,
  onOpenInSystemBrowser,
  onOpenNewTab,
}: {
  label: string;
  projects: JiraProject[];
  onOpen: (p: JiraProject) => void;
  onOpenInConductor: (p: JiraProject) => void;
  onOpenInSystemBrowser: (p: JiraProject) => void;
  onOpenNewTab: (p: JiraProject) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center gap-1 px-3 py-1.5 text-left hover:bg-zinc-800/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronRight
          className={`w-3 h-3 text-zinc-500 transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <span className="text-[10px] text-zinc-500 ml-auto">
          {projects.length}
        </span>
      </button>
      {!collapsed &&
        projects.map((project) => (
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
            <ContextMenuContent className="bg-zinc-900 border-zinc-700 min-w-[140px]">
              <ContextMenuItem
                className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                onClick={() => onOpenInConductor(project)}
              >
                <Globe className="w-3.5 h-3.5 mr-2" />
                Open in Conductor
              </ContextMenuItem>
              <ContextMenuItem
                className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                onClick={() => onOpenInSystemBrowser(project)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                Open in System Browser
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-zinc-700" />
              <ContextMenuItem
                className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"
                onClick={() => onOpenNewTab(project)}
              >
                <Plus className="w-3.5 h-3.5 mr-2" />
                Open in New Tab
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
    </div>
  );
}

function SessionsGroup({
  sessions,
  sessionThinking,
  onOpen,
  onKill,
  onRefresh,
}: {
  sessions: string[];
  sessionThinking: Record<string, { thinking: boolean; time?: string }>;
  onOpen: (name: string) => void;
  onKill: (name: string) => void;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center gap-1 px-3 py-1.5 text-left hover:bg-zinc-800/30 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <ChevronRight
          className={`w-3 h-3 text-zinc-500 transition-transform ${collapsed ? "" : "rotate-90"}`}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          TMUX Sessions
        </span>
        <span className="text-[10px] text-zinc-500 ml-auto">
          {sessions.length}
        </span>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="ml-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          title="Refresh sessions"
        >
          <RefreshCw className="w-3 h-3" />
        </span>
      </button>
      {!collapsed &&
        (sessions.length === 0 ? (
          <p className="px-7 pb-2 text-[11px] text-zinc-600">
            No active sessions
          </p>
        ) : (
          sessions.map((name) => {
            const { thinking, time } = sessionThinking[name] ?? { thinking: false };
            return (
              <div
                key={name}
                className="flex items-center gap-2 px-3 py-1 pl-7 group hover:bg-zinc-800/50 transition-colors cursor-pointer"
                onClick={() => onOpen(name)}
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${thinking ? "bg-emerald-400 animate-pulse" : "bg-zinc-700"}`}
                />
                <span
                  className={`text-xs truncate ${thinking ? "text-zinc-200" : "text-zinc-300"}`}
                >
                  {name}
                </span>
                {thinking && time && (
                  <span className="text-[10px] text-emerald-500/70 shrink-0 ml-auto mr-1">
                    {time}
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className={`${thinking && time ? "" : "ml-auto"} opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all shrink-0 p-0.5 rounded`}
                      title="Session options"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onKill(name);
                      }}
                      className="text-red-400 focus:text-red-400"
                    >
                      <X className="w-3 h-3 mr-2" />
                      Kill session
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        ))}
    </div>
  );
}
