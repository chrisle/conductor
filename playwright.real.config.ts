/**
 * Playwright config for real E2E tests that connect to Electron via CDP.
 * No web server needed — tests launch Electron themselves.
 *
 * Usage: npx playwright test --config playwright.real.config.ts
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/claude-start*', '**/claude-tab-real*', '**/autopilot-real-claude*', '**/autopilot-e2e*', '**/autopilot-haiku*', '**/file-click-real*', '**/jira-start-work*'],
  timeout: 90_000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
})
