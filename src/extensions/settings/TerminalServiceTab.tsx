import React, { useState, useEffect, useCallback } from 'react'
import { Server, CheckCircle, XCircle, RefreshCw, RefreshCcw, Square, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { TabProps } from '@/extensions/types'

interface SessionInfo {
  id: string
  dead: boolean
}

export default function TerminalServiceTab({ isActive }: TabProps): React.ReactElement {
  const [serviceInstalled, setServiceInstalled] = useState<boolean | null>(null)
  const [serviceRunning, setServiceRunning] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const res = await fetch('http://127.0.0.1:9800/api/tmux')
      if (res.ok) {
        const list: { name: string }[] = await res.json()
        setSessions(list.map(s => ({ id: s.name, dead: false })))
      }
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  async function killSession(id: string) {
    try {
      await fetch(`http://127.0.0.1:9800/api/tmux/${id}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== id))
    } catch {
      setMessage({ type: 'error', text: `Failed to kill session ${id}` })
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
      const res = await fetch('http://127.0.0.1:9800/health')
      setServiceRunning(res.ok)
    } catch {
      setServiceRunning(false)
    }
  }

  useEffect(() => {
    if (isActive) {
      checkStatus()
      loadSessions()
    }
  }, [isActive, loadSessions])

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
        </div>

        <Separator className="bg-zinc-800" />

        {/* Running sessions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-400">Active sessions</span>
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
          {sessions.length === 0 ? (
            <p className="text-xs text-zinc-600">No active sessions</p>
          ) : (
            <div className="space-y-1">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded bg-zinc-900 px-2 py-1.5 border border-zinc-800">
                  <span className="text-xs font-mono text-zinc-400 truncate">{s.id}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => killSession(s.id)}
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
