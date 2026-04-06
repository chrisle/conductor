import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { captureScrollback } from '@/lib/terminal-api'
import { stripAnsi } from '@/lib/terminal-detection'

/** Number of trailing lines to display in the preview */
const PREVIEW_LINES = 12

/**
 * Extracts the last N non-empty lines from raw scrollback text.
 * Strips ANSI escape codes so the preview is plain readable text.
 */
export function extractPreviewLines(raw: string, count: number = PREVIEW_LINES): string[] {
  const stripped = stripAnsi(raw)
  const lines = stripped.split('\n')

  // Walk backwards to collect the last `count` non-blank lines
  const result: string[] = []
  for (let i = lines.length - 1; i >= 0 && result.length < count; i--) {
    const line = lines[i]
    // Skip completely empty trailing lines (common after prompts)
    if (result.length === 0 && line.trim() === '') continue
    result.push(line)
  }

  return result.reverse()
}

/**
 * Shows a small terminal text preview inside a context menu.
 * Fetches scrollback from conductord via the captureScrollback IPC call.
 */
export default function TerminalPreview({ sessionId }: { sessionId: string }) {
  const [lines, setLines] = useState<string[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    captureScrollback(sessionId).then(raw => {
      if (cancelled) return
      if (!raw) {
        setError(true)
        return
      }
      setLines(extractPreviewLines(raw))
    }).catch(() => {
      if (!cancelled) setError(true)
    })

    return () => { cancelled = true }
  }, [sessionId])

  if (error) {
    return (
      <div className="px-2 py-2 text-ui-xs text-zinc-500 italic">
        Unable to load preview
      </div>
    )
  }

  if (lines === null) {
    return (
      <div className="flex items-center gap-2 px-2 py-3 text-ui-xs text-zinc-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading preview…
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="px-2 py-2 text-ui-xs text-zinc-500 italic">
        No output yet
      </div>
    )
  }

  return (
    <div className="px-1.5 py-1.5 max-h-[200px] overflow-y-auto">
      <pre className="font-mono text-[10px] leading-[14px] text-zinc-300 whitespace-pre-wrap break-all select-text">
        {lines.join('\n')}
      </pre>
    </div>
  )
}
