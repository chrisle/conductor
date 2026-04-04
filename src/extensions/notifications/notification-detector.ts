/**
 * Notification detection from terminal PTY data.
 *
 * Watches terminal output for patterns that indicate Claude Code has finished
 * a task, encountered an error, or the process has exited. Similar to how cmux
 * detects bell characters and completion patterns to trigger system notifications.
 *
 * Detection patterns:
 * - Claude Code completion: "ed for Xs" lines (e.g. "Cooked for 35s")
 * - Claude Code errors: lines containing "Error:" or "error:"
 * - Bell character (\x07): terminal bell used by many CLIs to signal completion
 */

import { stripAnsi } from '@/lib/terminal-detection'
import type { NotificationType } from '@/store/notifications'

export interface DetectedNotification {
  type: NotificationType
  title: string
  description: string
}

// Claude Code completion pattern: past-tense verb + "for" + duration
const COMPLETION_RE = /(\w+ed)\s+for\s+([\d]+m?\s*[\d]*s?)/i

// Error patterns
const ERROR_RE = /(?:^|\n)\s*(?:Error|error|ERROR|✗|✘|FAILED|Failed|Traceback)[\s:]/

// Bell character — terminals emit this when a command finishes or needs attention
const BELL_CHAR = '\x07'

/**
 * Analyze a chunk of terminal PTY data for notification-worthy events.
 * Returns a detected notification or null.
 */
export function detectNotification(
  data: string,
  tabTitle: string
): DetectedNotification | null {
  // Check for bell character first (like cmux)
  if (data.includes(BELL_CHAR)) {
    const stripped = stripAnsi(data.replace(/\x07/g, '')).trim()
    // If there's meaningful text alongside the bell, use it
    if (stripped.length > 0 && stripped.length < 200) {
      return {
        type: 'task-complete',
        title: `${tabTitle}: Task finished`,
        description: stripped.split('\n').pop()?.trim() || 'Command completed',
      }
    }
    return {
      type: 'task-complete',
      title: `${tabTitle}: Needs attention`,
      description: 'Terminal bell received',
    }
  }

  const stripped = stripAnsi(data)

  // Claude Code completion detection
  const completionMatch = stripped.match(COMPLETION_RE)
  if (completionMatch) {
    const verb = completionMatch[1]
    const duration = completionMatch[2].trim()
    return {
      type: 'task-complete',
      title: `${tabTitle}: ${verb} (${duration})`,
      description: stripped.split('\n').filter(l => l.trim()).pop()?.trim() || `Task ${verb.toLowerCase()}`,
    }
  }

  // Error detection
  if (ERROR_RE.test(stripped)) {
    const errorLine = stripped.split('\n').find(l => ERROR_RE.test(l))?.trim()
    if (errorLine && errorLine.length < 200) {
      return {
        type: 'task-error',
        title: `${tabTitle}: Error`,
        description: errorLine,
      }
    }
  }

  return null
}

/**
 * Check if a process exit event should generate a notification.
 */
export function detectExitNotification(tabTitle: string): DetectedNotification {
  return {
    type: 'process-exit',
    title: `${tabTitle}: Process exited`,
    description: 'The terminal process has ended',
  }
}
