import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests for the demo editor (headless Chromium).
// CI installs Playwright's Chromium; locally you can point PW_CHROMIUM at any
// installed Chrome/Chromium binary instead of downloading one.
const executablePath = process.env['PW_CHROMIUM'];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'pnpm --filter @lucid-sentence/demo exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
