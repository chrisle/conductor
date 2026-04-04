import { create } from 'zustand'

export interface ActivityBarState {
  activeExtensionId: string | null
  /** Remembers the last active extension so the sidebar can be restored after collapsing */
  lastActiveExtensionId: string | null
  setActiveExtension: (id: string | null) => void
  toggleExtension: (id: string) => void
  /** Collapse the sidebar, remembering the current extension */
  collapseSidebar: () => void
  /** Restore the sidebar to the previously active extension */
  restoreSidebar: () => void
  /** Toggle sidebar collapsed/expanded */
  toggleSidebar: () => void
}

export const useActivityBarStore = create<ActivityBarState>((set, get) => ({
  activeExtensionId: null,
  lastActiveExtensionId: null,

  setActiveExtension: (id) => set({ activeExtensionId: id }),

  toggleExtension: (id) => {
    const current = get().activeExtensionId
    if (current === id) {
      set({ activeExtensionId: null, lastActiveExtensionId: current })
    } else {
      set({ activeExtensionId: id, lastActiveExtensionId: current })
    }
  },

  collapseSidebar: () => {
    const current = get().activeExtensionId
    if (current) {
      set({ activeExtensionId: null, lastActiveExtensionId: current })
    }
  },

  restoreSidebar: () => {
    const last = get().lastActiveExtensionId
    if (last) {
      set({ activeExtensionId: last })
    }
  },

  toggleSidebar: () => {
    const { activeExtensionId, lastActiveExtensionId } = get()
    if (activeExtensionId) {
      set({ activeExtensionId: null, lastActiveExtensionId: activeExtensionId })
    } else if (lastActiveExtensionId) {
      set({ activeExtensionId: lastActiveExtensionId })
    }
  },
}))
