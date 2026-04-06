import React, { useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/store/sidebar'
import { useActivityBarStore } from '@/store/activityBar'
import { extensionRegistry } from '@/extensions'

interface SidebarProps {
  defaultGroupId: string
}

export default function Sidebar({ defaultGroupId }: SidebarProps): React.ReactElement {
  const { width, setWidth } = useSidebarStore()
  const { activeExtensionId } = useActivityBarStore()
  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    // rAF handle for throttling width updates to once per frame
    let rafId: number | null = null

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!isResizing.current) return
        setWidth(startWidth.current + (e.clientX - startX.current))
      })
    }
    const handleMouseUp = () => {
      isResizing.current = false
      if (rafId !== null) cancelAnimationFrame(rafId)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [width, setWidth])

  // No active extension = sidebar collapsed
  if (!activeExtensionId) return <></>

  const extension = extensionRegistry.getExtension(activeExtensionId)
  if (!extension?.sidebar) return <></>

  const SidebarContent = extension.sidebar

  return (
    <div className="flex shrink-0" style={{ width }}>
      <div className="flex flex-col flex-1 h-full bg-zinc-900 border-r border-zinc-800 overflow-hidden min-w-0">
        <SidebarContent groupId={defaultGroupId} />
      </div>

      {/* Resize handle */}
      <div
        className={cn('w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-500 transition-colors')}
        onMouseDown={handleResizeStart}
      />
    </div>
  )
}
