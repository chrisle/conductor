import { create } from 'zustand'

interface ActivityBarState {
  activeExtensionId: string | null
  setActiveExtension: (id: string | null) => void
  toggleExtension: (id: string) => void
}

export const useActivityBarStore = create<ActivityBarState>((set, get) => ({
  activeExtensionId: null,

  setActiveExtension: (id) => set({ activeExtensionId: id }),

  toggleExtension: (id) => {
    const current = get().activeExtensionId
    set({ activeExtensionId: current === id ? null : id })
  }
}))
