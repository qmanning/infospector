import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:7377', viewport: { width: 1500, height: 1300 }, permissions: ['clipboard-read', 'clipboard-write'] },
  webServer: { command: 'node test/serve.mjs 7377', url: 'http://localhost:7377/index.html', reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
