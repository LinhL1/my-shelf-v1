import { defineConfig } from '@playwright/test';

// A separate port keeps test data away from the real library.
const port = 5281;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/makeFixtures.ts',
  timeout: 60_000,
  workers: 2,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    port,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
