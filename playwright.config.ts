import { defineConfig, devices } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every run owns a fresh data directory; never touches the user's library.
const dataDir = process.env.YOWEB_E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'yoweb-e2e-'));
const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined);
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run db:migrate && npm run dev -- --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120000,
    env: { YOWEB_DATA_DIR: dataDir, NEXT_TELEMETRY_DISABLED: '1' },
  },
});
