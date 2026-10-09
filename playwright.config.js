import { defineConfig } from '@playwright/test';
const port = process.env.TEST_PORT || '5173';
const baseURL = 'http://127.0.0.1:' + port;
export default defineConfig({ testDir: './tests/browser', timeout: 120000, workers: 1,
  use: { baseURL, channel: process.env.CI ? undefined : 'chrome', headless: true, launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node server.js', url: baseURL, env: { PORT: port }, reuseExistingServer: !process.env.CI, timeout: 30000 }
});
