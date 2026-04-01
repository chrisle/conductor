import React, { useState, useEffect } from 'react'
import { Server, CheckCircle, XCircle, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TabProps } from '@/extensions/types'

/**
 * Standalone panel for System Tray settings.
 * Used by the settings dialog. Pass visible=true when the panel is shown.
 */
export function ConductorDaemonPanel({ visible = true }: { visible?: boolean }): React.ReactElement {
  const [serviceRunning, setServiceRunning] = useState<boolean | null>(null)
  const [fullDiskAccess, setFullDiskAccess] = useState<boolean | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function checkStatus() {
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
    if (visible) {
      checkStatus()
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const onFocus = () => checkStatus()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [visible])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-200">System Tray</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={checkStatus} className="h-7 w-7 text-zinc-500 hover:text-zinc-300">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Status message */}
      {message && (
        <div className={`px-3 py-2 text-ui-base rounded-md ${
          message.type === 'success' ? 'text-green-400 bg-green-950/30 border border-green-900/50' : 'text-red-400 bg-red-950/30 border border-red-900/50'
        }`}>
          {message.text}
        </div>
      )}

      {/* Status indicators */}
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Running</span>
          {serviceRunning === null ? (
            <span className="text-zinc-600">...</span>
          ) : serviceRunning ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-zinc-600" />
          )}
        </div>
      </div>

      {/* Permissions */}
      <div className="space-y-3">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider">Permissions</div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-zinc-400">Full Disk Access</div>
            <div className="text-ui-xs text-zinc-600 mt-0.5">Required to read files in protected directories (Desktop, Documents, etc.)</div>
          </div>
          <div className="flex items-center gap-1.5 ml-4 shrink-0">
            {fullDiskAccess === false && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.electronAPI.openFullDiskAccessSettings()}
                className="h-6 px-2 text-ui-xs text-amber-500 hover:text-amber-400"
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

      <p className="text-ui-base text-zinc-500 leading-relaxed">
        conductord runs in your menu bar. Terminals persist when the Conductor window is closed. Quit from the menu bar icon to stop.
      </p>
    </div>
  )
}

/**
 * Tab wrapper — delegates to the standalone panel.
 */
export default function TerminalServiceTab({ isActive }: TabProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      <div className="max-w-lg mx-auto w-full p-6">
        <ConductorDaemonPanel visible={isActive} />
      </div>
    </div>
  )
}
