import React, { useCallback } from 'react'
import {
  Bell, BellOff, CheckCheck, Trash2,
  AlertCircle, CheckCircle2, LogOut, MessageSquare, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import SidebarLayout from '@/components/Sidebar/SidebarLayout'
import { useNotificationsStore, type Notification, type NotificationType } from '@/store/notifications'
import { useTabsStore } from '@/store/tabs'
import { useTerminalNotifications } from './useTerminalNotifications'

function typeIcon(type: NotificationType) {
  switch (type) {
    case 'task-complete': return CheckCircle2
    case 'task-error': return AlertCircle
    case 'process-exit': return LogOut
    case 'mention': return MessageSquare
    case 'custom': return Zap
  }
}

function typeColor(type: NotificationType): string {
  switch (type) {
    case 'task-complete': return 'text-green-400'
    case 'task-error': return 'text-red-400'
    case 'process-exit': return 'text-zinc-400'
    case 'mention': return 'text-blue-400'
    case 'custom': return 'text-yellow-400'
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

function NotificationItem({
  notification,
  onNavigate,
}: {
  notification: Notification
  onNavigate: (n: Notification) => void
}) {
  const { markRead, removeNotification } = useNotificationsStore()
  const Icon = typeIcon(notification.type)
  const color = typeColor(notification.type)

  const handleClick = useCallback(() => {
    markRead(notification.id)
    onNavigate(notification)
  }, [notification, markRead, onNavigate])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'flex items-start gap-2.5 w-full px-3 py-2 text-left transition-colors hover:bg-zinc-800/60 group',
            !notification.read && 'bg-zinc-800/30'
          )}
        >
          <div className="shrink-0 mt-0.5">
            <Icon className={cn('w-3.5 h-3.5', color)} />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className={cn(
                'text-ui-sm truncate',
                notification.read ? 'text-zinc-400' : 'text-zinc-200 font-medium'
              )}>
                {notification.title}
              </span>
              {!notification.read && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              )}
            </div>
            <p className="text-ui-xs text-zinc-500 truncate">
              {notification.description}
            </p>
            <span className="text-ui-xs text-zinc-600">
              {formatTime(notification.time)}
            </span>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
        <ContextMenuItem
          className="gap-2 text-xs cursor-pointer"
          onClick={() => markRead(notification.id)}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          Mark as read
        </ContextMenuItem>
        <ContextMenuSeparator className="bg-zinc-700" />
        <ContextMenuItem
          className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300"
          onClick={() => removeNotification(notification.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SettingsPanel() {
  const { settings, updateSettings } = useNotificationsStore()

  const toggles: { key: keyof typeof settings; label: string; icon: React.ElementType }[] = [
    { key: 'taskComplete', label: 'Task completions', icon: CheckCircle2 },
    { key: 'taskError', label: 'Errors', icon: AlertCircle },
    { key: 'processExit', label: 'Process exits', icon: LogOut },
    { key: 'mention', label: 'Mentions', icon: MessageSquare },
  ]

  return (
    <div className="px-3 py-3 space-y-3 border-t border-zinc-700/50">
      <div className="text-ui-xs text-zinc-500 uppercase tracking-wider font-semibold">
        Notification Types
      </div>
      {toggles.map(({ key, label, icon: Icon }) => (
        <label key={key} className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={settings[key] as boolean}
            onChange={() => updateSettings({ [key]: !settings[key] })}
            className="accent-blue-500 w-3 h-3"
          />
          <Icon className="w-3 h-3 text-zinc-500" />
          <span className="text-ui-xs text-zinc-400 group-hover:text-zinc-300">
            {label}
          </span>
        </label>
      ))}
    </div>
  )
}

export default function NotificationsSidebar({ groupId }: { groupId: string }): React.ReactElement {
  // Start listening for terminal notifications
  useTerminalNotifications()

  const { notifications, settings, updateSettings, markAllRead, clearAll, getUnreadCount } = useNotificationsStore()
  const { setActiveTab } = useTabsStore()
  const unreadCount = getUnreadCount()

  const handleNavigate = useCallback((n: Notification) => {
    if (n.sourceTabId && n.sourceGroupId) {
      setActiveTab(n.sourceGroupId, n.sourceTabId)
    }
  }, [setActiveTab])

  const actions = [
    {
      icon: settings.enabled ? Bell : BellOff,
      label: settings.enabled ? 'Disable notifications' : 'Enable notifications',
      onClick: () => updateSettings({ enabled: !settings.enabled }),
      className: settings.enabled ? 'text-zinc-400 hover:text-zinc-200' : 'text-red-400 hover:text-red-300',
    },
    {
      icon: CheckCheck,
      label: 'Mark all as read',
      onClick: markAllRead,
      disabled: unreadCount === 0,
    },
    {
      icon: Trash2,
      label: 'Clear all',
      onClick: clearAll,
      disabled: notifications.length === 0,
    },
  ]

  return (
    <SidebarLayout
      title="Notifications"
      subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
      actions={actions}
      footer={!settings.enabled ? 'Notifications are disabled' : undefined}
    >
      <div className="flex flex-col h-full">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Bell className="w-8 h-8 text-zinc-700" />
            <p className="text-ui-sm text-zinc-600">No notifications yet</p>
            <p className="text-ui-xs text-zinc-700 text-center px-4">
              Notifications appear when tasks complete, errors occur, or processes exit in background tabs.
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="divide-y divide-zinc-800/50">
              {notifications.map(n => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        <SettingsPanel />
      </div>
    </SidebarLayout>
  )
}
