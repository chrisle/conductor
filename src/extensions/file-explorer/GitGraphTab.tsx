import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { RefreshCw, ChevronRight, ChevronDown, FileText, FilePlus, FileMinus, FileEdit, FileQuestion, Copy, Link, Mail, Hash, MessageSquare } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { TabProps } from '@/extensions/types'

interface Commit {
  hash: string
  abbrev: string
  parents: string[]
  author: string
  email: string
  date: string
  subject: string
  refs: string[]
  body: string
}

interface CommitDetail {
  files: Array<{ status: string; file: string }>
}

const LANE_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6',
]

interface GraphRow {
  commit: Commit
  column: number
  lanes: string[]
  connections: Array<{ fromCol: number; toCol: number; color: string }>
}

function buildGraph(commits: Commit[]): GraphRow[] {
  const rows: GraphRow[] = []
  let lanes: string[] = []

  for (const commit of commits) {
    let col = lanes.indexOf(commit.hash)
    if (col === -1) {
      col = lanes.indexOf('')
      if (col === -1) { col = lanes.length; lanes.push(commit.hash) }
      else { lanes[col] = commit.hash }
    }

    const connections: GraphRow['connections'] = []
    const snapshot = [...lanes]

    if (commit.parents.length === 0) {
      lanes[col] = ''
    } else {
      const [first, ...rest] = commit.parents
      lanes[col] = first
      for (const parent of rest) {
        const existing = lanes.indexOf(parent)
        if (existing !== -1) {
          connections.push({ fromCol: col, toCol: existing, color: LANE_COLORS[existing % LANE_COLORS.length] })
        } else {
          let nl = lanes.indexOf('')
          if (nl === -1) { nl = lanes.length; lanes.push(parent) }
          else { lanes[nl] = parent }
          connections.push({ fromCol: col, toCol: nl, color: LANE_COLORS[nl % LANE_COLORS.length] })
        }
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === '') lanes.pop()

    rows.push({ commit, column: col, lanes: snapshot, connections })
  }

  return rows
}

const ROW_HEIGHT = 28
const COL_WIDTH = 16
const NODE_R = 4
const PAD_LEFT = 8

function GraphCanvas({ rows, expandedSet, width, totalHeight }: { rows: GraphRow[]; expandedSet: Map<string, { height: number }>; width: number; totalHeight: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr
    c.height = totalHeight * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, totalHeight)

    let yOffset = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const y = yOffset + ROW_HEIGHT / 2

      // Lane lines
      for (let l = 0; l < row.lanes.length; l++) {
        if (!row.lanes[l]) continue
        const x = PAD_LEFT + l * COL_WIDTH + COL_WIDTH / 2
        ctx.strokeStyle = LANE_COLORS[l % LANE_COLORS.length]
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, y - ROW_HEIGHT / 2)
        ctx.lineTo(x, y + ROW_HEIGHT / 2)
        ctx.stroke()
      }

      // Merge/branch curves
      for (const conn of row.connections) {
        const fx = PAD_LEFT + conn.fromCol * COL_WIDTH + COL_WIDTH / 2
        const tx = PAD_LEFT + conn.toCol * COL_WIDTH + COL_WIDTH / 2
        ctx.strokeStyle = conn.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(fx, y)
        ctx.bezierCurveTo(fx, y + ROW_HEIGHT * 0.6, tx, y + ROW_HEIGHT * 0.4, tx, y + ROW_HEIGHT)
        ctx.stroke()
      }

      // Commit dot
      const cx = PAD_LEFT + row.column * COL_WIDTH + COL_WIDTH / 2
      ctx.fillStyle = LANE_COLORS[row.column % LANE_COLORS.length]
      ctx.beginPath()
      ctx.arc(cx, y, NODE_R, 0, Math.PI * 2)
      ctx.fill()

      if (row.commit.parents.length > 1) {
        ctx.fillStyle = '#18181b'
        ctx.beginPath()
        ctx.arc(cx, y, NODE_R - 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      yOffset += ROW_HEIGHT

      // If this commit is expanded, add gap for the expansion panel
      const expanded = expandedSet.get(row.commit.hash)
      if (expanded) {
        // Draw lane lines through the expanded area
        for (let l = 0; l < row.lanes.length; l++) {
          if (!row.lanes[l]) continue
          const x = PAD_LEFT + l * COL_WIDTH + COL_WIDTH / 2
          ctx.strokeStyle = LANE_COLORS[l % LANE_COLORS.length]
          ctx.globalAlpha = 0.3
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x, yOffset)
          ctx.lineTo(x, yOffset + expanded.height)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        yOffset += expanded.height
      }
    }
  }, [rows, expandedSet, width, totalHeight])

  return <canvas ref={canvasRef} style={{ width, height: totalHeight }} />
}

function RefBadge({ refName }: { refName: string }) {
  const cleaned = refName.replace('HEAD -> ', '')
  const isHead = refName.startsWith('HEAD -> ') || refName === 'HEAD'
  const isTag = cleaned.startsWith('tag: ')
  const label = isTag ? cleaned.replace('tag: ', '') : cleaned
  const isOrigin = label.startsWith('origin/')

  let cls = 'inline-flex items-center px-1.5 py-0 text-[11px] font-medium rounded border leading-snug '
  if (isHead && !isOrigin) cls += 'bg-green-500/20 text-green-400 border-green-500/30'
  else if (isTag) cls += 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  else if (isOrigin) cls += 'bg-purple-500/15 text-purple-400 border-purple-500/25'
  else cls += 'bg-blue-500/15 text-blue-400 border-blue-500/25'

  return <span className={cls}>{label}</span>
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function fileStatusIcon(status: string) {
  switch (status) {
    case 'A': return <FilePlus className="w-3.5 h-3.5 text-green-400 shrink-0" />
    case 'D': return <FileMinus className="w-3.5 h-3.5 text-red-400 shrink-0" />
    case 'M': return <FileEdit className="w-3.5 h-3.5 text-amber-400 shrink-0" />
    case 'R': return <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
    default: return <FileQuestion className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
  }
}

function fileStatusLabel(status: string) {
  switch (status) {
    case 'A': return 'Added'
    case 'D': return 'Deleted'
    case 'M': return 'Modified'
    case 'R': return 'Renamed'
    case 'C': return 'Copied'
    default: return status
  }
}

function CommitDetailPanel({ commit, detail, loading }: { commit: Commit; detail: CommitDetail | null; loading: boolean }) {
  const extendedBody = commit.body.trim()

  return (
    <div className="border-t border-zinc-800/50 bg-zinc-900/50 px-4 py-3 space-y-3">
      {/* Commit metadata */}
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex gap-2">
          <span className="text-zinc-500 w-12 shrink-0">Commit</span>
          <span className="font-mono text-zinc-400">{commit.hash}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-zinc-500 w-12 shrink-0">Author</span>
          <span className="text-zinc-300">{commit.author} &lt;{commit.email}&gt;</span>
        </div>
        <div className="flex gap-2">
          <span className="text-zinc-500 w-12 shrink-0">Date</span>
          <span className="text-zinc-400">{new Date(commit.date).toLocaleString()}</span>
        </div>
        {commit.parents.length > 0 && (
          <div className="flex gap-2">
            <span className="text-zinc-500 w-12 shrink-0">{commit.parents.length > 1 ? 'Parents' : 'Parent'}</span>
            <span className="font-mono text-zinc-400">{commit.parents.map(p => p.slice(0, 7)).join(' ')}</span>
          </div>
        )}
      </div>

      {/* Extended commit message */}
      {extendedBody && (
        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed border-l-2 border-zinc-700 pl-3">{extendedBody}</pre>
      )}

      {/* Changed files */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-44" />
        </div>
      ) : detail && detail.files.length > 0 ? (
        <div className="space-y-0.5">
          <div className="text-[11px] text-zinc-500 font-medium mb-1">{detail.files.length} file{detail.files.length !== 1 ? 's' : ''} changed</div>
          {detail.files.map((f) => (
            <div key={f.file} className="flex items-center gap-2 py-0.5 text-xs group/file hover:bg-zinc-800/30 rounded px-1 -mx-1">
              {fileStatusIcon(f.status)}
              <span className="text-zinc-300 truncate">{f.file}</span>
              <span className="text-[10px] text-zinc-600 shrink-0">{fileStatusLabel(f.status)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function GitGraphTab({ tab }: TabProps): React.ReactElement {
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedHashes, setExpandedHashes] = useState<Set<string>>(new Set())
  const [detailCache, setDetailCache] = useState<Record<string, CommitDetail>>({})
  const [detailLoading, setDetailLoading] = useState<Set<string>>(new Set())
  const [expandedHeights, setExpandedHeights] = useState<Map<string, { height: number }>>(new Map())
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const expandedPanelRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const repoPath = tab.filePath || ''

  async function load() {
    if (!repoPath) { setError('No repository path'); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const [log, url] = await Promise.all([
        window.electronAPI.gitLog(repoPath),
        window.electronAPI.gitRemoteUrl?.(repoPath) ?? Promise.resolve(null),
      ])
      setCommits(log)
      setRemoteUrl(url)
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [repoPath, tab.refreshKey])

  // Measure expanded panels
  useEffect(() => {
    if (expandedHashes.size === 0) {
      if (expandedHeights.size > 0) setExpandedHeights(new Map())
      return
    }
    const measure = () => {
      const next = new Map<string, { height: number }>()
      for (const hash of expandedHashes) {
        const el = expandedPanelRefs.current.get(hash)
        if (el) next.set(hash, { height: el.getBoundingClientRect().height })
      }
      setExpandedHeights(next)
    }
    requestAnimationFrame(measure)
  }, [expandedHashes, detailCache])

  const toggleExpand = useCallback(async (hash: string) => {
    setExpandedHashes(prev => {
      const next = new Set(prev)
      if (next.has(hash)) { next.delete(hash) } else { next.add(hash) }
      return next
    })
    if (!detailCache[hash]) {
      setDetailLoading(prev => new Set(prev).add(hash))
      try {
        const { files } = await window.electronAPI.gitShow(repoPath, hash)
        setDetailCache(prev => ({ ...prev, [hash]: { files } }))
      } catch {
        setDetailCache(prev => ({ ...prev, [hash]: { files: [] } }))
      }
      setDetailLoading(prev => { const next = new Set(prev); next.delete(hash); return next })
    }
  }, [detailCache, repoPath])

  const graphRows = useMemo(() => buildGraph(commits), [commits])

  const maxCols = useMemo(() => {
    let m = 0
    for (const r of graphRows) {
      m = Math.max(m, r.lanes.length, r.column + 1)
      for (const c of r.connections) m = Math.max(m, c.toCol + 1)
    }
    return m
  }, [graphRows])

  const graphWidth = PAD_LEFT + maxCols * COL_WIDTH + COL_WIDTH

  // Compute total height including expanded panels
  const totalHeight = useMemo(() => {
    let h = graphRows.length * ROW_HEIGHT
    for (const [, { height }] of expandedHeights) h += height
    return h
  }, [graphRows, expandedHeights])

  if (loading) {
    return (
      <div className="h-full w-full p-4 space-y-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-6 rounded-full" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 flex-1 max-w-md" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">{error}</div>
  }

  if (commits.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-zinc-500">No commits found</div>
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2">
        <span className="text-xs text-zinc-400">{commits.length} commits</span>
        <button onClick={load} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Sticky column headers */}
        <div className="flex sticky top-0 z-10 bg-zinc-950 border-b border-zinc-800/50">
          <div className="shrink-0" style={{ width: graphWidth }}>
            <div className="px-2 py-1.5 text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Graph</div>
          </div>
          <div className="flex-1 min-w-0 flex items-center px-3 gap-2" style={{ height: ROW_HEIGHT }}>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider shrink-0 w-14 text-right">Hash</span>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider flex-1">Message</span>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider shrink-0 ml-auto pl-4">Author</span>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider shrink-0 w-16 text-right">Date</span>
          </div>
        </div>

        <div className="flex" style={{ minHeight: totalHeight }}>
          {/* Graph canvas */}
          <div className="shrink-0" style={{ width: graphWidth }}>
            <GraphCanvas rows={graphRows} expandedSet={expandedHeights} width={graphWidth} totalHeight={totalHeight} />
          </div>

          {/* Commit rows */}
          <div className="flex-1 min-w-0">
            {graphRows.map((row) => {
              const isExpanded = expandedHashes.has(row.commit.hash)
              const commitUrl = remoteUrl ? `${remoteUrl}/commit/${row.commit.hash}` : null
              return (
                <React.Fragment key={row.commit.hash}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={`flex items-center transition-colors group px-3 gap-2 cursor-pointer select-none ${
                          isExpanded ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/40'
                        }`}
                        style={{ height: ROW_HEIGHT }}
                        onClick={() => toggleExpand(row.commit.hash)}
                      >
                        <span className="font-mono text-[11px] text-zinc-500 shrink-0 w-14 text-right group-hover:text-zinc-400">
                          {row.commit.abbrev}
                        </span>

                        {row.commit.refs.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            {row.commit.refs.map((ref) => <RefBadge key={ref} refName={ref} />)}
                          </div>
                        )}

                        <span className="text-sm text-zinc-200 truncate flex-1">{row.commit.subject}</span>

                        <span className="shrink-0 w-3 flex items-center justify-center text-zinc-500">
                          {isExpanded
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          }
                        </span>

                        <span className="text-[11px] text-zinc-600 shrink-0 pl-4">{row.commit.author}</span>
                        <span className="text-[11px] text-zinc-600 shrink-0 w-16 text-right">{formatDate(row.commit.date)}</span>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
                      <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(row.commit.hash)}>
                        <Hash className="w-3.5 h-3.5" />
                        Copy Hash
                      </ContextMenuItem>
                      <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(row.commit.subject)}>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Title
                      </ContextMenuItem>
                      <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(
                        row.commit.body ? `${row.commit.subject}\n\n${row.commit.body}` : row.commit.subject
                      )}>
                        <MessageSquare className="w-3.5 h-3.5" />
                        Copy Commit Message
                      </ContextMenuItem>
                      <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(row.commit.email)}>
                        <Mail className="w-3.5 h-3.5" />
                        Copy Author Email
                      </ContextMenuItem>
                      {commitUrl && (
                        <>
                          <ContextMenuSeparator className="bg-zinc-700" />
                          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(commitUrl)}>
                            <Link className="w-3.5 h-3.5" />
                            Copy Commit Link
                          </ContextMenuItem>
                          <ContextMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => window.electronAPI.openExternal(commitUrl)}>
                            <Link className="w-3.5 h-3.5" />
                            Open in Browser
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>

                  {isExpanded && (
                    <div
                      ref={(el) => {
                        if (el) expandedPanelRefs.current.set(row.commit.hash, el)
                        else expandedPanelRefs.current.delete(row.commit.hash)
                      }}
                      className="pr-3"
                      style={{ paddingLeft: 'calc(0.75rem + 3.5rem + 0.5rem)' }}
                    >
                      <CommitDetailPanel
                        commit={row.commit}
                        detail={detailCache[row.commit.hash] ?? null}
                        loading={detailLoading.has(row.commit.hash)}
                      />
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
