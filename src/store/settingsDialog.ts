import { create } from 'zustand'

interface SettingsDialogState {
  open: boolean
  activeSection: string
  setOpen: (open: boolean) => void
  setActiveSection: (section: string) => void
  openToSection: (section: string) => void
}

export const useSettingsDialogStore = create<SettingsDialogState>((set) => ({
  open: false,
  activeSection: 'general',

  setOpen: (open) => set({ open }),

  setActiveSection: (section) => set({ activeSection: section }),

  openToSection: (section) => set({ open: true, activeSection: section }),
}))
