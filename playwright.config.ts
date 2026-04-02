import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  retries: 0,
  testIgnore: ['**/autopilot-real-claude*', '**/claude-start*', '**/claude-tab-real*'],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite --config vite.web.config.ts --port 5174',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
