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
import { useConfigStore } from '@/store/config';

// Extract a Jira ticket key (e.g. "PROJ-123") from the tab title.
function extractTicketKey(title: string): string | null {
  const match = title.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
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
  const onPtyData = usePtyHandlers(tabId, groupId);

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

  const footer = (
    <>
      <Toggle
        on={autoPilot}
        onToggle={() => setAutoPilot(!autoPilot)}
        label="Fuck it"
      />
      {sessionId && (
        <>
          <div className="w-px h-3 bg-zinc-700" />
          <span
            className="text-ui-xs font-mono text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors truncate max-w-[220px]"
            title={sessionId}
            onClick={() => navigator.clipboard.writeText(sessionId)}
          >
            Session: {sessionId.slice(0, 8)}
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
        // not auto-launch claude — the process is already running in tmux.
        initialCommand: tab.initialCommand
          ? buildClaudeCommand(tab.initialCommand, settings, tab.apiKey)
          : undefined,
      }}
      onPtyData={onPtyData}
      onTerminalReady={handleTerminalReady}
      onSessionReady={(isNew: boolean, opts?: { autoPilot?: boolean }) => {
        updateTab(groupId, tabId, { hasTmuxSession: true });
        handleSessionReady(isNew, opts);
      }}
      interceptKeys={interceptKeys}
      footer={footer}
      footerPosition="bottom"
    />
  );
}
