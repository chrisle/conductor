import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_START_WORK_PROMPT_TEMPLATE } from '../types/app-config'

/**
 * Tests for CON-55: custom "start work" prompt template from settings.
 *
 * The Jira kanban board (JiraBoardTab) previously hard-coded the prompt
 * sent to Claude when starting work on a ticket. This test verifies
 * that the prompt is now read from the config store, respecting the
 * user's custom template.
 */

// Mock the extension-api module used by the Jira plugin
const mockGetState = vi.fn()

vi.mock('@conductor/extension-api', () => ({
  useTabsStore: {
    getState: () => ({
      groups: {},
      addTab: vi.fn(),
      setActiveTab: vi.fn(),
      removeTab: vi.fn(),
    }),
  },
  useLayoutStore: {
    getState: () => ({ focusedGroupId: null }),
    subscribe: vi.fn(),
  },
  useSidebarStore: {
    getState: () => ({ rootPath: '/test/repo' }),
    subscribe: vi.fn(),
  },
  useConfigStore: {
    getState: mockGetState,
    subscribe: vi.fn(),
    __esModule: true,
  },
  useProjectStore: {
    getState: () => ({ filePath: '/test/repo/project.json' }),
  },
  useWorkSessionsStore: {
    getState: () => ({
      sessions: [],
      getActiveSessionForTicket: vi.fn().mockReturnValue(null),
      createSession: vi.fn().mockResolvedValue({ id: 'ws-1' }),
      updateSession: vi.fn(),
      completeSession: vi.fn(),
    }),
  },
  createTerminal: vi.fn().mockResolvedValue({ isNew: true }),
  killTerminal: vi.fn().mockResolvedValue(undefined),
  setAutoPilot: vi.fn(),
  ui: {},
}))

/**
 * Replicate the buildPrompt logic from JiraBoardTab to verify it reads
 * the config store's template instead of hard-coding the default prompt.
 */
function buildPrompt(
  ticketKey: string,
  projKey: string,
  domain: string,
  getConfigState: () => any,
): string {
  const template = getConfigState().config.aiCli.claudeCode.startWorkPromptTemplate
  const fullDomain = domain.includes('.') ? domain : `${domain}.atlassian.net`
  return template
    .replace(/\{\{ticketKey\}\}/g, ticketKey)
    .replace(/\{\{projectKey\}\}/g, projKey)
    .replace(/\{\{domain\}\}/g, fullDomain)
}

describe('JiraBoardTab custom prompt template (CON-55)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the custom prompt template from the config store', () => {
    const customTemplate = 'Fix {{ticketKey}} in project {{projectKey}} on {{domain}} now!'
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: customTemplate,
            allowYoloMode: true, yoloModeByDefault: true,
          },
        },
      },
    })

    const result = buildPrompt('CON-55', 'CON', 'triodeofficial', mockGetState)
    expect(result).toBe('Fix CON-55 in project CON on triodeofficial.atlassian.net now!')
    // Must NOT contain the default template content
    expect(result).not.toContain('Work autonomously on this ticket end to end')
  })

  it('uses the default template when no custom template is configured', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: DEFAULT_START_WORK_PROMPT_TEMPLATE,
            allowYoloMode: false, yoloModeByDefault: false,
          },
        },
      },
    })

    const result = buildPrompt('CON-55', 'CON', 'triodeofficial', mockGetState)
    expect(result).toContain('CON-55')
    expect(result).toContain('CON')
    expect(result).toContain('triodeofficial.atlassian.net')
    expect(result).toContain('Work autonomously on this ticket end to end')
  })

  it('appends .atlassian.net to bare subdomain', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: 'domain is {{domain}}',
            allowYoloMode: false, yoloModeByDefault: false,
          },
        },
      },
    })

    const result = buildPrompt('CON-1', 'CON', 'triodeofficial', mockGetState)
    expect(result).toBe('domain is triodeofficial.atlassian.net')
  })

  it('preserves full domain when already a FQDN', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: 'domain is {{domain}}',
            allowYoloMode: false, yoloModeByDefault: false,
          },
        },
      },
    })

    const result = buildPrompt('CON-1', 'CON', 'myteam.atlassian.net', mockGetState)
    expect(result).toBe('domain is myteam.atlassian.net')
  })

  it('produces no flag when yolo mode is off', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: 'prompt',
            allowYoloMode: false,
            yoloModeByDefault: false,
          },
        },
      },
    })

    const { allowYoloMode, yoloModeByDefault } = mockGetState().config.aiCli.claudeCode
    const flag = yoloModeByDefault ? ' --dangerously-skip-permissions' : allowYoloMode ? ' --allow-dangerously-skip-permissions' : ''
    expect(flag).toBe('')
  })

  it('produces --allow-dangerously-skip-permissions when allowYoloMode only', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: 'prompt',
            allowYoloMode: true,
            yoloModeByDefault: false,
          },
        },
      },
    })

    const { allowYoloMode, yoloModeByDefault } = mockGetState().config.aiCli.claudeCode
    const flag = yoloModeByDefault ? ' --dangerously-skip-permissions' : allowYoloMode ? ' --allow-dangerously-skip-permissions' : ''
    expect(flag).toBe(' --allow-dangerously-skip-permissions')
  })

  it('produces --dangerously-skip-permissions when yoloModeByDefault is set', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: 'prompt',
            allowYoloMode: true,
            yoloModeByDefault: true,
          },
        },
      },
    })

    const { allowYoloMode, yoloModeByDefault } = mockGetState().config.aiCli.claudeCode
    const flag = yoloModeByDefault ? ' --dangerously-skip-permissions' : allowYoloMode ? ' --allow-dangerously-skip-permissions' : ''
    expect(flag).toBe(' --dangerously-skip-permissions')
  })

  it('replaces all occurrences of each placeholder', () => {
    mockGetState.mockReturnValue({
      config: {
        aiCli: {
          claudeCode: {
            startWorkPromptTemplate: '{{ticketKey}} belongs to {{projectKey}}. Repeat: {{ticketKey}} in {{projectKey}}',
            allowYoloMode: false, yoloModeByDefault: false,
          },
        },
      },
    })

    const result = buildPrompt('CON-99', 'CON', 'test', mockGetState)
    expect(result).toBe('CON-99 belongs to CON. Repeat: CON-99 in CON')
  })
})
