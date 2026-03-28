import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw,
  ChevronRight,
  Globe,
  ExternalLink,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useProjectStore } from "@/store/project";
import { useConfigStore } from "@/store/config";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Pin } from "lucide-react";

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
  // Re-derive config when the config store finishes loading (async IPC)
  const configReady = useConfigStore(s => s.ready);
  useEffect(() => {
    if (configReady && !config) {
      const loaded = loadConfig();
      if (loaded) setConfig(loaded);
    }
  }, [configReady]);
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
  const { addTab, setActiveTab, groups } = useTabsStore();
  const { focusedGroupId } = useLayoutStore();
  const { rootPath } = useSidebarStore();
  const filterRef = useRef<HTMLInputElement>(null);

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

  const jiraSpaceKeys = useProjectStore(s => s.jiraSpaceKeys);
  const hasLinkedSpaces = jiraSpaceKeys.length > 0;

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

  // Linked projects (pinned at top when project has jiraSpaceKeys)
  const linkedProjects = hasLinkedSpaces
    ? projects.filter(p => jiraSpaceKeys.includes(p.key))
    : [];

  // Remaining projects (exclude linked when filtering is off)
  const remainingFiltered = hasLinkedSpaces && !filter
    ? filtered.filter(p => !jiraSpaceKeys.includes(p.key))
    : filtered;

  // Group by projectTypeKey
  const grouped = new Map<string, JiraProject[]>();
  for (const p of remainingFiltered) {
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
        <div className="px-3 py-2 space-y-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
              <Skeleton className="h-3.5" style={{ width: `${40 + (i * 15) % 40}%` }} />
              <Skeleton className="h-3 w-8 ml-auto shrink-0" />
            </div>
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && !error && (
        <div className="px-3 py-4 text-xs text-zinc-500">No projects found</div>
      )}

      {/* Linked spaces (pinned at top) */}
      {linkedProjects.length > 0 && (
        <div className="mb-1">
          <div className="px-3 py-1.5 flex items-center gap-1">
            <Pin className="w-3 h-3 text-blue-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">
              Linked
            </span>
          </div>
          {linkedProjects.map(project => (
            <button
              key={project.id}
              onClick={() => openBoard(project)}
              className="w-full text-left px-3 py-1.5 pl-7 hover:bg-zinc-800/50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                {project.avatarUrl && (
                  <img src={project.avatarUrl} alt="" className="w-4 h-4 rounded-sm shrink-0" />
                )}
                <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">
                  {project.name}
                </span>
                <span className="text-[10px] text-zinc-500 shrink-0 ml-auto">
                  {project.key}
                </span>
              </div>
            </button>
          ))}
          <div className="border-t border-zinc-800/60 mt-1" />
        </div>
      )}

      {/* All projects (collapsed when linked spaces exist) */}
      {hasLinkedSpaces ? (
        <Collapsible defaultOpen={!hasLinkedSpaces}>
          <CollapsibleTrigger className="w-full flex items-center gap-1 px-3 py-1.5 text-left hover:bg-zinc-800/30 transition-colors">
            <ChevronRight className="w-3 h-3 text-zinc-500 transition-transform data-[state=open]:rotate-90" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              All Projects
            </span>
            <span className="text-[10px] text-zinc-500 ml-auto">{remainingFiltered.length}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Collapsible>
      ) : (
        [...grouped.entries()].map(([type, typeProjects]) => (
          <ProjectGroup
            key={type}
            label={typeLabels[type] || type}
            projects={typeProjects}
            onOpen={openBoard}
            onOpenInConductor={openInConductorBrowser}
            onOpenInSystemBrowser={openInSystemBrowser}
            onOpenNewTab={(p) => openBoard(p, true)}
          />
        ))
      )}

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

