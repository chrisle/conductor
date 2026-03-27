import React, { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTabsStore } from '@/store/tabs'
import { useLayoutStore } from '@/store/layout'
import { useSidebarStore } from '@/store/sidebar'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import ClaudeOptionsDialog from './ClaudeOptionsDialog'

interface Session {
  id: string
  mtime: number
  summary: string
}

function formatRelativeTime(mtime: number): string {
  const diff = Date.now() - mtime
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(mtime).toLocaleDateString()
}

export default function ClaudeSidebar({ groupId }: { groupId: string }): React.ReactElement {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const { addTab } = useTabsStore()
  const { focusedGroupId } = useLayoutStore()
  const { rootPath } = useSidebarStore()

  const loadSessions = useCallback(async () => {
    let projectPath = rootPath
    if (!projectPath) {
      try {
        projectPath = await window.electronAPI.getCwd()
      } catch { /* fall through */ }
    }
    if (!projectPath) {
      setSessions([])
      return
    }
    setLoading(true)
    try {
      const result = await window.electronAPI.listClaudeSessions(projectPath)
      setSessions(result)
    } catch (err) {
      console.error('[claude-sidebar] failed to load sessions:', err)
    } finally {
      setLoading(false)
    }
  }, [rootPath])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  function resumeSession(sessionId: string) {
    const targetGroup = focusedGroupId || groupId
    addTab(targetGroup, {
      type: 'claude',
      title: 'Claude',
      filePath: rootPath || undefined,
      initialCommand: `claude --resume ${sessionId}\n`
    })
  }

  return (
    <>
    <SidebarLayout
      title="Sessions"
      actions={[
        { icon: RefreshCw, label: 'Refresh', onClick: loadSessions, disabled: loading, spinning: loading },
      ]}
      onSettings={() => setOptionsOpen(true)}
    >
      {sessions.length === 0 && !loading && (
        <div className="px-3 py-4 text-xs text-zinc-500">
          {rootPath ? 'No sessions found' : 'Open a project first'}
        </div>
      )}

      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => resumeSession(session.id)}
          className="w-full text-left px-3 py-1.5 hover:bg-zinc-800/50 transition-colors border-b border-zinc-700/30 group"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-200 group-hover:text-zinc-50">{session.id.slice(0, 8)}</span>
            <span className="text-[10px] text-zinc-500">{formatRelativeTime(session.mtime)}</span>
          </div>
          {session.summary && (
            <div className="text-[11px] text-zinc-400 truncate mt-0.5 group-hover:text-zinc-300">
              {session.summary}
            </div>
          )}
        </button>
      ))}
    </SidebarLayout>
    <ClaudeOptionsDialog open={optionsOpen} onClose={() => setOptionsOpen(false)} />
    </>
  )
}
