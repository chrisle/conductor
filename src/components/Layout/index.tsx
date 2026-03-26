import React, { useEffect, useRef } from 'react'
import { useLayoutStore } from '@/store/layout'
import { useTabsStore } from '@/store/tabs'
import ActivityBar from '../ActivityBar'
import Sidebar from '../Sidebar'
import SplitPane from './SplitPane'

export default function MainLayout(): React.ReactElement {
  const { root, setRoot, setFocusedGroup } = useLayoutStore()
  const { createGroup } = useTabsStore()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Create initial group and set layout
    const groupId = createGroup()
    setRoot({ type: 'leaf', groupId })
    setFocusedGroup(groupId)

  }, [])

  if (!root) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-600">
        Loading...
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ActivityBar />
      <Sidebar defaultGroupId={getFirstGroupId(root)} />
      <div className="flex-1 min-w-0 overflow-hidden">
        <SplitPane node={root} />
      </div>
    </div>
  )
}

function getFirstGroupId(node: ReturnType<typeof useLayoutStore.getState>['root']): string {
  if (!node) return ''
  if (node.type === 'leaf') return node.groupId
  return getFirstGroupId(node.first)
}
