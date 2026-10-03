import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://localhost:8080', channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
  webServer: { command: 'npm start', url: 'http://localhost:8080', reuseExistingServer: !process.env.CI },
});
