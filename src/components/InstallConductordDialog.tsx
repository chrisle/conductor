import React, { useState } from 'react'
import { Server } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

interface Props {
  open: boolean
  onDismiss: () => void
}

export default function InstallConductordDialog({ open, onDismiss }: Props): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleInstall() {
    setLoading(true)
    setError('')
    try {
      const result = await window.electronAPI.installConductord()
      if (result.success) {
        onDismiss()
      } else {
        setError(result.error || 'Install failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !loading) onDismiss() }}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-sm" hideClose>
        <VisuallyHidden><DialogTitle>Install conductord</DialogTitle></VisuallyHidden>
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-200">Install conductord</div>
              <div className="text-[11px] text-zinc-500">Background service required</div>
            </div>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Conductor needs a background service to run terminal sessions. It keeps your terminals alive even when the app is closed.
          </p>
          <p className="text-[11px] text-zinc-600">
            Installs as a macOS launch agent. You can remove it anytime from Settings.
          </p>
          {error && (
            <div className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={onDismiss}
            disabled={loading}
          >
            Later
          </Button>
          <Button
            className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
            onClick={handleInstall}
            disabled={loading}
          >
            {loading ? 'Installing…' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
