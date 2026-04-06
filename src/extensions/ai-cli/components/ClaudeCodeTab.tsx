import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { useSidebarStore } from '@/store/sidebar';
import type { TabProps } from '@/extensions/types';
import TerminalTab from '../../terminal/TerminalTab';
import Toggle from './Toggle';
import { usePtyHandlers } from '../pty-handlers/usePtyHandlers';
import { useSessionDetect } from '../contexts/useSessionDetect';
import { useClaudeCodeSettings } from '../contexts/useClaudeCodeSettings';
import { buildClaudeCommand } from '../contexts/buildClaudeCommand';
import { setAutoPilot as setAutoPilotWs } from '@/lib/terminal-api';
import { getSessionAutoPilot, setSessionAutoPilot } from '@/lib/session-autopilot';
import { useTabsStore } from '@/store/tabs';
import { useWorkSessionsStore } from '@/store/work-sessions';
import { useConfigStore } from '@/store/config'
import { useSessionMetrics } from '../hooks/useSessionMetrics';
import { useAggregateMetricsStore } from '@/store/aggregate-metrics';

// Extract a Jira ticket key (e.g. "PROJ-123") from the tab title.
function extractTicketKey(title: string): string | null {
  const match = title.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

// Shorten model IDs for display: "claude-opus-4-6" → "Opus 4.6"
function formatModelName(model: string): string {
  const match = model.match(/claude-(\w+)-(\d+)-(\d+)/)
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1)
    return `${name} ${match[2]}.${match[3]}`
  }
  // Fallback: strip "claude-" prefix
  return model.replace(/^claude-/, '')
}

// Color-code context percentage: green < 70%, amber 70–90%, red ≥ 90%
function contextColor(percent: number): string {
  if (percent >= 90) return 'text-red-400'
  if (percent >= 70) return 'text-amber-400'
  return 'text-emerald-400'
}

// Format token speed for compact display: 1234 → "1.2k t/s", 42 → "42 t/s"
function formatSpeed(speed: number | null): string {
  if (speed == null) return '— t/s'
  if (speed >= 1000) return `${(speed / 1000).toFixed(1)}k t/s`
  return `${speed} t/s`
}

export default function ClaudeCodeTab({
  tabId,
  groupId,
  isActive,
  tab,
}: TabProps): React.ReactElement {
  const settings = useClaudeCodeSettings();
  const [autoPilot, setAutoPilot] = useState(tab.autoPilot ?? getSessionAutoPilot(tabId));
  const { rootPath } = useSidebarStore();
  const claudeAccounts = useConfigStore((s) => s.config.claudeAccounts);
  const apiKeyAccount = tab.apiKey
    ? claudeAccounts.find((a) => a.apiKey === tab.apiKey)
    : null;
  const { updateTab } = useTabsStore();
  const writeRef = useRef<((data: string) => void) | null>(null);
  const autoPilotRef = useRef(autoPilot);

  useEffect(() => {
    autoPilotRef.current = autoPilot;
  }, [autoPilot]);

  // Sync autopilot state to conductord and persist it whenever it changes
  useEffect(() => {
    setAutoPilotWs(tabId, autoPilot);
    setSessionAutoPilot(tabId, autoPilot);
  }, [autoPilot, tabId]);

  const projectPath = tab.filePath || rootPath || undefined;
  const sessionId = useSessionDetect(tab.initialCommand, projectPath);
  const metrics = useSessionMetrics(sessionId, projectPath);
  const onPtyData = usePtyHandlers(tabId, groupId);

  // Push per-tab token speeds into the aggregate store for the Footer's summed t/s display
  useEffect(() => {
    if (metrics) {
      useAggregateMetricsStore.getState().setTabMetrics(tabId, {
        inputSpeed: metrics.inputSpeed,
        outputSpeed: metrics.outputSpeed,
      });
    } else {
      useAggregateMetricsStore.getState().removeTab(tabId);
    }
  }, [tabId, metrics?.inputSpeed, metrics?.outputSpeed]);

  // Clean up aggregate store entry when tab unmounts
  useEffect(() => {
    return () => { useAggregateMetricsStore.getState().removeTab(tabId); };
  }, [tabId]);

  // Persist the detected session ID back to the work session so
  // "Open in Claude" can resume the same session next time.
  useEffect(() => {
    if (!sessionId) return;
    const ticketKey = extractTicketKey(tab.title);
    if (!ticketKey) return;
    const sessionsStore = useWorkSessionsStore.getState();
    const workSession = sessionsStore.getActiveSessionForTicket(ticketKey);
    if (workSession) {
      sessionsStore.updateSession(workSession.id, {
        claudeSessionId: sessionId,
      });
    }
  }, [sessionId, tab.title]);

  const handleTerminalReady = useCallback(
    (write: (data: string) => void) => {
      writeRef.current = write;
      // Sync saved autopilot state to conductord on (re)connect
      if (autoPilotRef.current) {
        setAutoPilotWs(tabId, true);
      }
    },
    [tabId],
  );

  const handleSessionReady = useCallback(
    (isNew: boolean, opts?: { autoPilot?: boolean }) => {
      // Restore autopilot state from conductord when reattaching to an existing session
      if (!isNew && opts?.autoPilot && !autoPilotRef.current) {
        setAutoPilot(true);
        updateTab(groupId, tabId, { autoPilot: true });
      }
    },
    [tabId, groupId, updateTab],
  );

  // Translate Shift+Enter → Alt+Enter (newline) in Claude's input
  const interceptKeys = useMemo(
    () =>
      (e: React.KeyboardEvent, write: (data: string) => void): boolean => {
        if (
          e.key === 'Enter' &&
          e.shiftKey &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          e.preventDefault();
          e.stopPropagation();
          // Send ESC + CR which is what Alt+Enter produces in a terminal
          write('\x1b\r');
          return true;
        }
        return false;
      },
    [],
  );

  // Auto Pilot toggle pinned to the left side of the toolbar
  const footerLeft = (
    <Toggle
      on={autoPilot}
      onToggle={() => setAutoPilot(!autoPilot)}
      label="Auto Pilot"
    />
  );

  // All stats pinned to the right side of the toolbar
  const footer = (
    <>
      {sessionId && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <span
            className="text-ui-xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[220px]"
            title={sessionId}
            onClick={() => navigator.clipboard.writeText(sessionId)}
          >
            Claude ID: {sessionId.slice(0, 8)}
          </span>
        </>
      )}
      {apiKeyAccount && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <span className="text-ui-xs text-zinc-500">
            API Key: <span className="text-zinc-400">{apiKeyAccount.name}</span>
          </span>
        </>
      )}
      {metrics && (
        <>
          {metrics.model && (
            <>
              <div className="w-px h-3 bg-zinc-700" />
              <span className="text-ui-xs text-zinc-500 truncate max-w-[140px]" title={metrics.model}>
                {formatModelName(metrics.model)}
              </span>
            </>
          )}
          {metrics.contextPercent != null && (
            <>
              <div className="w-px h-3 bg-zinc-700" />
              <span className={`text-ui-xs font-mono ${contextColor(metrics.contextPercent)}`}>
                Ctx {metrics.contextPercent.toFixed(0)}%
              </span>
            </>
          )}
          {metrics.outputSpeed != null && (
            <>
              <div className="w-px h-3 bg-zinc-700" />
              <span className="text-ui-xs font-mono text-zinc-500">
                {formatSpeed(metrics.inputSpeed)} in
              </span>
              <span className="text-ui-xs font-mono text-zinc-500">
                {formatSpeed(metrics.outputSpeed)} out
              </span>
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <TerminalTab
      tabId={tabId}
      groupId={groupId}
      isActive={isActive}
      tab={{
        ...tab,
        // Only transform if an initialCommand was explicitly set by the caller.
        // Restored tabs (from project file) have no initialCommand and should
        // not auto-launch claude — the process is already running.
        initialCommand: tab.initialCommand
          ? buildClaudeCommand(tab.initialCommand, settings, tab.apiKey)
          : undefined,
      }}
      onPtyData={onPtyData}
      onTerminalReady={handleTerminalReady}
      onSessionReady={(isNew: boolean, opts?: { autoPilot?: boolean }) => {
        updateTab(groupId, tabId, { hasSession: true });
        handleSessionReady(isNew, opts);
      }}
      interceptKeys={interceptKeys}
      footerLeft={footerLeft}
      footer={footer}
      footerPosition="bottom"
    />
  );
}
