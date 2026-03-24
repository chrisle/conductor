import React, { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useLayoutStore, type LayoutNode } from '@/store/layout'
import TabGroup from './TabGroup'

interface SplitPaneProps {
  node: LayoutNode
}

export default function SplitPane({ node }: SplitPaneProps): React.ReactElement {
  if (node.type === 'leaf') {
    return <TabGroup groupId={node.groupId} />
  }

  return <SplitNode node={node} />
}

interface SplitNodeProps {
  node: Extract<LayoutNode, { type: 'split' }>
}

function SplitNode({ node }: SplitNodeProps): React.ReactElement {
  const { setRatio } = useLayoutStore()
  const isResizing = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startPos = useRef(0)
  const startRatio = useRef(node.ratio)

  const isHorizontal = node.direction === 'horizontal'

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    startPos.current = isHorizontal ? e.clientX : e.clientY
    startRatio.current = node.ratio
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    // We need to identify this split node by one of its group IDs
    const firstGroupId = getFirstGroupId(node.first)

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pos = isHorizontal ? e.clientX : e.clientY
      const size = isHorizontal ? rect.width : rect.height
      const offset = isHorizontal ? rect.left : rect.top
      const ratio = Math.max(0.1, Math.min(0.9, (pos - offset) / size))
      if (firstGroupId) {
        setRatio(firstGroupId, ratio)
      }
    }

    const handleMouseUp = () => {
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [node, isHorizontal, setRatio])

  const firstSize = `${node.ratio * 100}%`
  const secondSize = `${(1 - node.ratio) * 100}%`

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full overflow-hidden',
        isHorizontal ? 'flex-row' : 'flex-col'
      )}
    >
      <div style={{ [isHorizontal ? 'width' : 'height']: firstSize }} className="overflow-hidden">
        <SplitPane node={node.first} />
      </div>

      {/* Resize handle */}
      <div
        className={cn(
          'shrink-0 bg-zinc-800 hover:bg-blue-500 active:bg-blue-500 transition-colors z-10',
          isHorizontal
            ? 'w-1 cursor-col-resize'
            : 'h-1 cursor-row-resize'
        )}
        onMouseDown={handleResizeStart}
      />

      <div
        style={{ [isHorizontal ? 'width' : 'height']: secondSize }}
        className="overflow-hidden flex-1"
      >
        <SplitPane node={node.second} />
      </div>
    </div>
  )
}

function getFirstGroupId(node: LayoutNode): string | null {
  if (node.type === 'leaf') return node.groupId
  return getFirstGroupId(node.first)
}
