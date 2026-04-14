import React, { useEffect, useState, useCallback } from 'react'
import { Terminal, GitBranch, FolderOpen, RefreshCw, FilePlus, FolderPlus, ExternalLink, Eye, X, ChevronDown, Plus, Check, UserCircle } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import { useConfigStore } from '@/store/config'
import { useProjectStore } from '@/store/project'
import { useSettingsDialogStore } from '@/store/settingsDialog'
import { resolveTerminalCwd, saveTerminalCwd } from '@/lib/terminal-cwd'
import { nextSessionId } from '@/lib/session-id'
import ClaudeIcon from '@/components/ui/ClaudeIcon'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import type { SidebarAction } from '@/components/Sidebar/SidebarHeader'
import FileTree from '@/components/Sidebar/FileTree'
import BranchPicker from '@/components/Sidebar/BranchPicker'

interface FileExplorerSidebarProps {
  groupId: string
}

/** Truncate a path from the left, showing the rightmost segments that fit. */
function truncatePath(fullPath: string): string {
  const tilded = fullPath.replace(/^\/Users\/[^/]+/, '~')
  const parts = tilded.split('/')
  if (parts.length <= 3) return tilded
  return '.../' + parts.slice(-2).join('/')
}

export default function FileExplorerSidebar({ groupId }: FileExplorerSidebarProps): React.ReactElement {
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath, gitRef, virtualPath, exitVirtualMode } = useSidebarStore()
  const claudeAccounts = useConfigStore(s => s.config.claudeAccounts)
  const defaultClaudeAccountId = useConfigStore(s => s.config.defaultClaudeAccountId)
  const projectSettings = useProjectStore(s => s.projectSettings)
  const setProjectSettings = useProjectStore(s => s.setProjectSettings)
  const effectiveDefaultAccountId = projectSettings?.defaultClaudeAccountId !== undefined
    ? projectSettings.defaultClaudeAccountId
    : defaultClaudeAccountId
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [shortstat, setShortstat] = useState<{ insertions: number; deletions: number }>({ insertions: 0, deletions: 0 })
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)

  const loadGitInfo = useCallback(async () => {
    if (!rootPath) { setIsGitRepo(false); setCurrentBranch(null); return }
    const [branch, stat] = await Promise.all([
      window.electronAPI.gitBranch(rootPath),
      window.electronAPI.gitShortstat(rootPath),
    ])
    setIsGitRepo(branch !== null)
    setCurrentBranch(branch)
    setShortstat(stat)
  }, [rootPath])

  useEffect(() => { loadGitInfo() }, [loadGitInfo])

  // Refresh git info when sidebar refreshes
  useEffect(() => {
    const handler = () => { loadGitInfo() }
    window.addEventListener('sidebar:refresh', handler)
    return () => window.removeEventListener('sidebar:refresh', handler)
  }, [loadGitInfo])

  function addClaudeTab(apiKey?: string, accountName?: string) {
    const cwd = rootPath || '/'
    const targetGroup = focusedGroupId || groupId
    const id = nextSessionId('claude-code')
    let resolvedApiKey = apiKey
    let resolvedName = accountName
    if (resolvedApiKey === undefined && effectiveDefaultAccountId) {
      const defaultAccount = claudeAccounts.find(a => a.id === effectiveDefaultAccountId)
      if (defaultAccount) {
        resolvedApiKey = defaultAccount.apiKey
        resolvedName = defaultAccount.name
      }
    }
    addTab(targetGroup, {
      id,
      type: 'claude-code',
      title: resolvedName ? `${id} (${resolvedName})` : id,
      filePath: cwd,
      initialCommand: 'claude\n',
      apiKey: resolvedApiKey,
    })
  }

  function setProjectDefaultAccount(id: string | null) {
    setProjectSettings({ ...projectSettings, defaultClaudeAccountId: id })
    useProjectStore.getState().markWorkspaceDirty()
  }

  function openTerminalHere() {
    const cwd = rootPath || resolveTerminalCwd()
    saveTerminalCwd(cwd)
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, { type: 'terminal', title: 'Terminal', filePath: cwd })
  }
  const actions: SidebarAction[] = [
    { icon: RefreshCw, label: 'Refresh', onClick: () => window.dispatchEvent(new Event('sidebar:refresh')) },
  ]

  return (
    <SidebarLayout
      title="Files"
      actions={actions}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-col flex-1 overflow-hidden min-h-0">
            {gitRef && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/20 border-b border-amber-700/30 shrink-0 min-w-0">
                <Eye className="w-3 h-3 text-amber-500 shrink-0" />
                <span className="text-ui-xs text-amber-400 truncate">
                  Browsing <span className="font-medium">{gitRef}</span> <span className="text-amber-600">(read-only)</span>
                </span>
                <button onClick={exitVirtualMode} className="ml-auto text-zinc-500 hover:text-zinc-300 shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {(rootPath || gitRef) && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-700/50 shrink-0 min-w-0">
                {isGitRepo && !gitRef ? (
                  <BranchPicker
                    open={branchPickerOpen}
                    onOpenChange={setBranchPickerOpen}
                    repoPath={rootPath!}
                  >
                    <button
                      role="combobox"
                      aria-expanded={branchPickerOpen}
                      className="flex items-center gap-1.5 min-w-0 hover:text-zinc-200 transition-colors group"
                    >
                      <GitBranch className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span className="text-ui-xs text-zinc-400 truncate group-hover:text-zinc-200">
                        {currentBranch || 'detached'}
                      </span>
                      {(shortstat.insertions > 0 || shortstat.deletions > 0) && (
                        <span className="flex items-center gap-1 text-ui-xs shrink-0">
                          {shortstat.insertions > 0 && (
                            <span className="text-emerald-500">+{shortstat.insertions}</span>
                          )}
                          {shortstat.deletions > 0 && (
                            <span className="text-red-400">-{shortstat.deletions}</span>
                          )}
                        </span>
                      )}
                      <ChevronDown className="w-3 h-3 text-zinc-600 shrink-0 group-hover:text-zinc-400" />
                    </button>
                  </BranchPicker>
                ) : (
                  <>
                    <FolderOpen className="w-3 h-3 text-zinc-500 shrink-0" />
                    <span
                      className="text-ui-xs text-zinc-400 truncate block"
                      title={gitRef ? virtualPath || '/' : rootPath || ''}
                    >
                      {gitRef ? (virtualPath || '/') : truncatePath(rootPath || '')}
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <FileTree groupId={groupId} />
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="bg-zinc-900/80 backdrop-blur-xl border-zinc-700 min-w-[140px]">
          {!gitRef && (
            <>
              <ContextMenuItem
                className="gap-2 text-xs cursor-pointer"
                onClick={() => window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'file' } }))}
              >
                <FilePlus className="w-3.5 h-3.5" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                className="gap-2 text-xs cursor-pointer"
                onClick={() => window.dispatchEvent(new CustomEvent('sidebar:new', { detail: { type: 'folder' } }))}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator className="bg-zinc-700" />
            </>
          )}
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
              <ClaudeIcon className="w-3.5 h-3.5 text-[#D97757] shrink-0" />
              <span>Claude</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-zinc-900/80 backdrop-blur-xl border-zinc-700">
              <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Claude Accounts</ContextMenuLabel>
              <ContextMenuSeparator className="bg-zinc-700" />
              <ContextMenuItem
                onClick={() => addClaudeTab()}
                className="gap-2 text-ui-base cursor-pointer"
              >
                Default
              </ContextMenuItem>
              {claudeAccounts.length > 0 && <ContextMenuSeparator className="bg-zinc-700" />}
              {claudeAccounts.map(account => (
                <ContextMenuItem
                  key={account.id}
                  onClick={() => addClaudeTab(account.apiKey, account.name)}
                  className="gap-2 text-ui-base cursor-pointer"
                >
                  {account.name}
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator className="bg-zinc-700" />
              <ContextMenuItem
                onClick={() => useSettingsDialogStore.getState().openToSection('ai-cli')}
                className="gap-2 text-ui-base cursor-pointer text-zinc-400"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </ContextMenuItem>
              {claudeAccounts.length > 0 && (
                <>
                  <ContextMenuSeparator className="bg-zinc-700" />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="gap-2 text-ui-base cursor-pointer text-zinc-400">
                      <UserCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Project Default</span>
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-zinc-900/80 backdrop-blur-xl border-zinc-700">
                      <ContextMenuLabel className="text-ui-xs text-zinc-500 font-normal py-0.5">Default for this project</ContextMenuLabel>
                      <ContextMenuSeparator className="bg-zinc-700" />
                      <ContextMenuItem
                        onClick={() => setProjectDefaultAccount(null)}
                        className="gap-2 text-ui-base cursor-pointer"
                      >
                        {effectiveDefaultAccountId == null && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        {effectiveDefaultAccountId != null && <span className="w-3.5" />}
                        Use Global Default
                      </ContextMenuItem>
                      <ContextMenuSeparator className="bg-zinc-700" />
                      {claudeAccounts.map(account => (
                        <ContextMenuItem
                          key={account.id}
                          onClick={() => setProjectDefaultAccount(account.id)}
                          className="gap-2 text-ui-base cursor-pointer"
                        >
                          {effectiveDefaultAccountId === account.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                          {effectiveDefaultAccountId !== account.id && <span className="w-3.5" />}
                          {account.name}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            className="gap-2 text-xs cursor-pointer"
            onClick={openTerminalHere}
          >
            <Terminal className="w-3.5 h-3.5" />
            Open Terminal here
          </ContextMenuItem>
          {!gitRef && (
            <ContextMenuItem
              className="gap-2 text-xs cursor-pointer"
              onClick={() => {
                if (rootPath) window.electronAPI.openExternal(`file://${rootPath}`)
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {window.electronAPI.platform === 'darwin' ? 'Open in Finder' : 'Open in File Explorer'}
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </SidebarLayout>
  )
}
