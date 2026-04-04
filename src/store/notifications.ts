import { create } from 'zustand'
import { nanoid } from '../lib/nanoid'

export type NotificationType =
  | 'task-complete'
  | 'task-error'
  | 'process-exit'
  | 'mention'
  | 'custom'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  time: number // timestamp
  sourceTabId: string | null
  sourceGroupId: string | null
  read: boolean
}

export interface NotificationSettings {
  enabled: boolean
  taskComplete: boolean
  taskError: boolean
  processExit: boolean
  mention: boolean
  soundEnabled: boolean
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  taskComplete: true,
  taskError: true,
  processExit: true,
  mention: true,
  soundEnabled: false,
}

export interface NotificationsState {
  notifications: Notification[]
  settings: NotificationSettings
  /** Per-tab unread notification counts */
  tabBadges: Record<string, number>

  addNotification: (n: Omit<Notification, 'id' | 'time' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
  removeNotification: (id: string) => void
  updateSettings: (patch: Partial<NotificationSettings>) => void
  getUnreadCount: () => number
  getTabBadgeCount: (tabId: string) => number
}

const STORAGE_KEY = 'conductor:notification-settings'

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  settings: loadSettings(),
  tabBadges: {},

  addNotification: (n) => {
    const { settings } = get()
    if (!settings.enabled) return

    // Check per-type settings
    const typeMap: Record<NotificationType, keyof NotificationSettings> = {
      'task-complete': 'taskComplete',
      'task-error': 'taskError',
      'process-exit': 'processExit',
      'mention': 'mention',
      'custom': 'enabled',
    }
    const settingKey = typeMap[n.type]
    if (settingKey && !settings[settingKey]) return

    const notification: Notification = {
      ...n,
      id: nanoid(),
      time: Date.now(),
      read: false,
    }

    set(state => {
      const tabBadges = { ...state.tabBadges }
      if (n.sourceTabId) {
        tabBadges[n.sourceTabId] = (tabBadges[n.sourceTabId] || 0) + 1
      }
      return {
        notifications: [notification, ...state.notifications].slice(0, 200),
        tabBadges,
      }
    })
  },

  markRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  },

  markAllRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      tabBadges: {},
    }))
  },

  clearAll: () => {
    set({ notifications: [], tabBadges: {} })
  },

  removeNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    }))
  },

  updateSettings: (patch) => {
    set(state => {
      const settings = { ...state.settings, ...patch }
      saveSettings(settings)
      return { settings }
    })
  },

  getUnreadCount: () => {
    return get().notifications.filter(n => !n.read).length
  },

  getTabBadgeCount: (tabId) => {
    return get().tabBadges[tabId] || 0
  },
}))
