import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', timeout: 120000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', channel: process.env.CI ? undefined : 'chrome', headless: true, launchOptions: { args: ['--enable-unsafe-swiftshader'] } },
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI }
});
