import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke tests for the demo editor (headless Chromium).
// CI installs Playwright's Chromium; locally you can point PW_CHROMIUM at any
// installed Chrome/Chromium binary instead of downloading one.
const executablePath = process.env['PW_CHROMIUM'];
// PW_PORT picks another preview port (for example when several checkouts share a machine).
const port = Number(process.env['PW_PORT'] ?? 4173);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `pnpm --filter @lucid-sentence/demo exec vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
