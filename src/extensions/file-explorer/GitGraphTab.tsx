import React, { useEffect, useState, useRef, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
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

function GraphCanvas({ rows, width, height }: { rows: GraphRow[]; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = width * dpr
    c.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const y = i * ROW_HEIGHT + ROW_HEIGHT / 2

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
    }
  }, [rows, width, height])

  return <canvas ref={canvasRef} style={{ width, height }} />
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

export default function GitGraphTab({ tab }: TabProps): React.ReactElement {
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const repoPath = tab.filePath || ''

  async function load() {
    if (!repoPath) { setError('No repository path'); setLoading(false); return }
    setLoading(true)
    setError('')
    try {
      const log = await window.electronAPI.gitLog(repoPath)
      setCommits(log)
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [repoPath, tab.refreshKey])

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
  const graphHeight = graphRows.length * ROW_HEIGHT

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
        <div className="flex min-w-fit" style={{ height: graphHeight }}>
          {/* Graph canvas */}
          <div className="shrink-0" style={{ width: graphWidth }}>
            <GraphCanvas rows={graphRows} width={graphWidth} height={graphHeight} />
          </div>

          {/* Commit rows */}
          <div className="flex-1 min-w-0">
            {graphRows.map((row) => (
              <div
                key={row.commit.hash}
                className="flex items-center hover:bg-zinc-800/40 transition-colors group px-3 gap-2"
                style={{ height: ROW_HEIGHT }}
              >
                <span className="font-mono text-[11px] text-zinc-500 shrink-0 w-14 text-right group-hover:text-zinc-400">
                  {row.commit.abbrev}
                </span>

                {row.commit.refs.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {row.commit.refs.map((ref) => <RefBadge key={ref} refName={ref} />)}
                  </div>
                )}

                <span className="text-sm text-zinc-200 truncate">{row.commit.subject}</span>

                <span className="ml-auto text-[11px] text-zinc-600 shrink-0 pl-4">{row.commit.author}</span>
                <span className="text-[11px] text-zinc-600 shrink-0 w-16 text-right">{formatDate(row.commit.date)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
