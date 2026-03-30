import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Server, CheckCircle, XCircle, RefreshCw, RefreshCcw, Square, Play, X, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import type { TabProps } from '@/extensions/types'

interface TmuxSession {
  name: string
  connected: boolean
  command: string
  cwd: string
  created: number
  activity: number
}

function shortPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

function timeAgo(epoch: number): string {
  if (!epoch) return ''
  const diff = Math.floor(Date.now() / 1000) - epoch
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function TerminalServiceTab({ isActive }: TabProps): React.ReactElement {
  const [serviceInstalled, setServiceInstalled] = useState<boolean | null>(null)
  const [serviceRunning, setServiceRunning] = useState<boolean | null>(null)
  const [fullDiskAccess, setFullDiskAccess] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const list: TmuxSession[] = await window.electronAPI.conductordGetTmuxSessions()
      setSessions(list)
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const { connected, orphaned } = useMemo(() => {
    const connected: TmuxSession[] = []
    const orphaned: TmuxSession[] = []
    for (const s of sessions) {
      if (s.connected) connected.push(s)
      else orphaned.push(s)
    }
    return { connected, orphaned }
  }, [sessions])

  async function killSession(name: string) {
    try {
      await window.electronAPI.conductordKillTmuxSession(name)
      setSessions(prev => prev.filter(s => s.name !== name))
    } catch {
      setMessage({ type: 'error', text: `Failed to kill session ${name}` })
    }
  }

  async function killOrphaned() {
    try {
      const data = await window.electronAPI.conductordKillOrphanedTmux()
      if (data.ok) {
        setMessage({ type: 'success', text: `Killed ${data.killed} orphaned session${data.killed === 1 ? '' : 's'}` })
        loadSessions()
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to kill orphaned sessions' })
    }
  }

  async function checkStatus() {
    try {
      const installed = await window.electronAPI.isConductordInstalled()
      setServiceInstalled(installed)
    } catch {
      setServiceInstalled(false)
    }

    try {
      const ok = await window.electronAPI.conductordHealth()
      setServiceRunning(ok)
    } catch {
      setServiceRunning(false)
    }

    try {
      const fda = await window.electronAPI.hasFullDiskAccess()
      setFullDiskAccess(fda)
    } catch {
      setFullDiskAccess(null)
    }
  }

  useEffect(() => {
    if (isActive) {
      checkStatus()
      loadSessions()
    }
  }, [isActive, loadSessions])

  // Re-check status when the window regains focus (e.g., after granting FDA in System Settings)
  useEffect(() => {
    if (!isActive) return
    const onFocus = () => checkStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [isActive])

  async function handleInstall() {
    setLoading(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.installConductord()
      if (result.success) {
        setMessage({ type: 'success', text: 'Service installed and started.' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Install failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
      checkStatus()
    }
  }

  async function handleUninstall() {
    setLoading(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.uninstallConductord()
      if (result.success) {
        setMessage({ type: 'success', text: 'Service uninstalled.' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Uninstall failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
      checkStatus()
    }
  }

  async function handleRestart() {
    setLoading(true)
    setMessage(null)
    try {
      const result = await window.electronAPI.restartConductord()
      if (result.success) {
        setMessage({ type: 'success', text: 'Service restarted.' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Restart failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
      setTimeout(checkStatus, 1000)
    }
  }

  async function handleToggleRunning() {
    setLoading(true)
    setMessage(null)
    try {
      const result = serviceRunning
        ? await window.electronAPI.stopConductord()
        : await window.electronAPI.startConductord()
      if (result.success) {
        setMessage({ type: 'success', text: serviceRunning ? 'Service stopped.' : 'Service started.' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Operation failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) })
    } finally {
      setLoading(false)
      setTimeout(checkStatus, 1000)
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      <div className="max-w-lg mx-auto w-full p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-zinc-400" />
            <h2 className="text-sm font-medium text-zinc-200">Conductor Daemon</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={checkStatus} className="h-7 w-7 text-zinc-500 hover:text-zinc-300">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Status message */}
        {message && (
          <div className={`px-3 py-2 text-xs rounded-md ${
            message.type === 'success' ? 'text-green-400 bg-green-950/30 border border-green-900/50' : 'text-red-400 bg-red-950/30 border border-red-900/50'
          }`}>
            {message.text}
          </div>
        )}

        {/* Status indicators */}
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Service installed</span>
            {serviceInstalled === null ? (
              <span className="text-zinc-600">...</span>
            ) : serviceInstalled ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-zinc-600" />
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Service running</span>
            <div className="flex items-center gap-1.5">
              {serviceInstalled && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRestart}
                    disabled={loading}
                    className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                    title="Restart service"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleRunning}
                    disabled={loading}
                    className={`h-6 w-6 ${serviceRunning ? 'text-zinc-500 hover:text-red-400' : 'text-zinc-500 hover:text-green-400'}`}
                    title={serviceRunning ? 'Stop service' : 'Start service'}
                  >
                    {serviceRunning ? <Square className="w-3 h-3" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                </>
              )}
              {serviceRunning === null ? (
                <span className="text-zinc-600">...</span>
              ) : serviceRunning ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-zinc-600" />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Full Disk Access</span>
            <div className="flex items-center gap-1.5">
              {fullDiskAccess === false && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.electronAPI.openFullDiskAccessSettings()}
                  className="h-6 px-2 text-[10px] text-amber-500 hover:text-amber-400"
                  title="Open System Settings to grant Full Disk Access"
                >
                  Grant access
                </Button>
              )}
              {fullDiskAccess === null ? (
                <span className="text-zinc-600">...</span>
              ) : fullDiskAccess ? (
                <ShieldCheck className="w-4 h-4 text-green-500" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              )}
            </div>
          </div>
        </div>

        <Separator className="bg-zinc-800" />

        {/* Tmux sessions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Tmux sessions</span>
            <div className="flex items-center gap-1">
              {orphaned.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={killOrphaned}
                  className="h-6 px-2 text-[10px] text-zinc-500 hover:text-red-400"
                  title={`Kill ${orphaned.length} orphaned session${orphaned.length === 1 ? '' : 's'}`}
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Kill {orphaned.length} orphaned
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={loadSessions}
                disabled={sessionsLoading}
                className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
                title="Refresh sessions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          {sessionsLoading && sessions.length === 0 ? (
            <div className="space-y-1">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-zinc-900 px-2 py-1.5 border border-zinc-800">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-5 w-5 rounded" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-zinc-600">No tmux sessions</p>
          ) : (
            <div className="space-y-1">
              {[...connected, ...orphaned].map(s => (
                <div key={s.name} className="flex items-center gap-2 rounded bg-zinc-900 px-2 py-1.5 border border-zinc-800">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.connected ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                    title={s.connected ? 'Connected' : 'Orphaned'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-zinc-400 truncate">{s.name}</span>
                      {s.command && (
                        <span className="text-[10px] text-zinc-600 shrink-0">{s.command}</span>
                      )}
                    </div>
                    {s.cwd && (
                      <div className="text-[10px] text-zinc-600 truncate">{shortPath(s.cwd)}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-700 shrink-0">{timeAgo(s.activity)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => killSession(s.name)}
                    className="h-5 w-5 shrink-0 text-zinc-600 hover:text-red-400"
                    title="Kill session"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator className="bg-zinc-800" />

        <p className="text-xs text-zinc-500 leading-relaxed">
          conductord manages terminal sessions in the background. When installed as a service, your terminals persist across app restarts.
        </p>

        {!serviceInstalled && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleInstall}
            disabled={loading}
            className="w-full text-xs h-9"
          >
            <Server className="w-3.5 h-3.5 mr-1.5" />
            Install Service
          </Button>
        )}
      </div>
    </div>
  )
}
