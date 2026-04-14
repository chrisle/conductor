import React, { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useLayoutStore, type LayoutNode, type LayoutChild } from '@/store/layout'
import TabGroup from './TabGroup'

interface SplitPaneProps {
  node: LayoutNode
}

function SplitPane({ node }: SplitPaneProps): React.ReactElement {
  if (node.type === 'leaf') {
    return <TabGroup groupId={node.groupId} />
  }

  return <ContainerNode node={node} />
}

export default React.memo(SplitPane)

// ---------------------------------------------------------------------------
// N-ary container renderer
// ---------------------------------------------------------------------------

interface ContainerNodeProps {
  node: Extract<LayoutNode, { type: 'row' | 'column' }>
}

function ContainerNode({ node }: ContainerNodeProps): React.ReactElement {
  const isRow = node.type === 'row'
  const { children } = node

  const totalSize = children.reduce((s, c) => s + c.size, 0)

  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden',
        isRow ? 'flex-row' : 'flex-col'
      )}
    >
      {children.map((child, i) => {
        const pct = `${(child.size / totalSize) * 100}%`
        return (
          <React.Fragment key={getChildKey(child)}>
            {/* Pane */}
            <div
              style={{ [isRow ? 'width' : 'height']: pct, contain: 'strict' }}
              className={cn(
                'overflow-hidden',
                i === children.length - 1 && 'flex-1'
              )}
            >
              <SplitPane node={child.node} />
            </div>

            {/* Resize handle between panes */}
            {i < children.length - 1 && (
              <ResizeHandle
                node={node}
                index={i}
                isRow={isRow}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/** Stable key for a layout child. */
function getChildKey(child: LayoutChild): string {
  if (child.node.type === 'leaf') return child.node.groupId
  return collectFirstGroupId(child.node) || 'unknown'
}

function collectFirstGroupId(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.groupId
  for (const c of node.children) {
    const id = collectFirstGroupId(c.node)
    if (id) return id
  }
  return null
}

// ---------------------------------------------------------------------------
// Resize handle
// ---------------------------------------------------------------------------

interface ResizeHandleProps {
  node: Extract<LayoutNode, { type: 'row' | 'column' }>
  index: number // index of the child to the LEFT/ABOVE of this handle
  isRow: boolean
}

function ResizeHandle({ node, index, isRow }: ResizeHandleProps): React.ReactElement {
  const { setSizes } = useLayoutStore()
  const isResizing = useRef(false)
  const handleRef = useRef<HTMLDivElement>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = isRow ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
    // Notify webview-bearing components so they can show an overlay that
    // prevents the native <webview> from swallowing mouse events.
    window.dispatchEvent(new Event('pane-resize-start'))

    // We need to find a groupId in this container to call setSizes
    const firstChild = node.children[0]
    const anchorGroupId = collectFirstGroupId(firstChild.node)
    if (!anchorGroupId) return

    // Get the container element (parent of the handle)
    const container = handleRef.current?.parentElement
    if (!container) return

    const startSizes = node.children.map(c => c.size)
    const totalSize = startSizes.reduce((s, v) => s + v, 0)

    // rAF handle for throttling layout updates to once per frame
    let rafId: number | null = null

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current || !container) return

      // Throttle store updates to one per animation frame to avoid
      // expensive layout recalculations on every mouse event
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!isResizing.current) return

        const rect = container.getBoundingClientRect()
        const pos = isRow ? ev.clientX - rect.left : ev.clientY - rect.top
        const containerSize = isRow ? rect.width : rect.height

        const minSize = totalSize * 0.05
        const fraction = Math.max(0, Math.min(1, pos / containerSize))

        const sizeBefore = fraction * totalSize
        const sizeAfter = totalSize - sizeBefore

        const beforeGroup = startSizes.slice(0, index + 1)
        const afterGroup = startSizes.slice(index + 1)
        const beforeTotal = beforeGroup.reduce((s, v) => s + v, 0)
        const afterTotal = afterGroup.reduce((s, v) => s + v, 0)

        const newSizes = [...startSizes]

        if (beforeTotal > 0) {
          for (let i = 0; i <= index; i++) {
            newSizes[i] = Math.max(minSize, (beforeGroup[i] / beforeTotal) * sizeBefore)
          }
        }
        if (afterTotal > 0) {
          for (let i = index + 1; i < startSizes.length; i++) {
            newSizes[i] = Math.max(minSize, (afterGroup[i - index - 1] / afterTotal) * sizeAfter)
          }
        }

        setSizes(anchorGroupId, newSizes)
      })
    }

    const handleMouseUp = () => {
      isResizing.current = false
      if (rafId !== null) cancelAnimationFrame(rafId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      window.dispatchEvent(new Event('pane-resize-end'))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [node, isRow, setSizes, index])

  return (
    <div
      ref={handleRef}
      className={cn(
        'shrink-0 bg-zinc-800 hover:bg-blue-500 active:bg-blue-500 transition-colors z-10',
        isRow
          ? 'w-1 cursor-col-resize'
          : 'h-1 cursor-row-resize'
      )}
      onMouseDown={handleResizeStart}
    />
  )
}
