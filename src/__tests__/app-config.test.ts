import { describe, it, expect } from 'vitest'
import { DEFAULT_APP_CONFIG } from '../types/app-config'
import type { AppConfig, DeepPartial } from '../types/app-config'

describe('DEFAULT_APP_CONFIG', () => {
  it('has version 1', () => {
    expect(DEFAULT_APP_CONFIG.version).toBe(1)
  })

  it('has default zoom of 1', () => {
    expect(DEFAULT_APP_CONFIG.ui.zoom).toBe(1)
  })

  it('has empty kanban compact columns', () => {
    expect(DEFAULT_APP_CONFIG.ui.kanbanCompactColumns).toEqual([])
  })

  it('has empty claude accounts', () => {
    expect(DEFAULT_APP_CONFIG.claudeAccounts).toEqual([])
  })

  it('has empty jira connections', () => {
    expect(DEFAULT_APP_CONFIG.jiraConnections).toEqual([])
  })

  it('has claude code default settings', () => {
    expect(DEFAULT_APP_CONFIG.aiCli.claudeCode.skipDangerousPermissions).toBe(false)
    expect(DEFAULT_APP_CONFIG.aiCli.claudeCode.autoPilotScanMs).toBe(250)
    expect(DEFAULT_APP_CONFIG.aiCli.claudeCode.disableBackgroundTasks).toBe(true)
  })

  it('has codex default settings', () => {
    expect(DEFAULT_APP_CONFIG.aiCli.codex.autoPilotScanMs).toBe(250)
  })

  it('has empty disabled extensions', () => {
    expect(DEFAULT_APP_CONFIG.extensions.disabled).toEqual([])
  })

  it('has terminal scrollback default of 10000 lines', () => {
    expect(DEFAULT_APP_CONFIG.customization.terminal.scrollback).toBe(10000)
  })
})

describe('AppConfig type structure', () => {
  it('DEFAULT_APP_CONFIG satisfies AppConfig', () => {
    const config: AppConfig = DEFAULT_APP_CONFIG
    expect(config).toBeDefined()
  })

  it('DeepPartial allows partial nested objects', () => {
    const partial: DeepPartial<AppConfig> = {
      ui: { zoom: 2 },
    }
    expect(partial.ui?.zoom).toBe(2)
    expect(partial.version).toBeUndefined()
  })
})
