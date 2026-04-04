// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Trickle Test — Playwright config
 * Runs against local serve.js (port 3000) or GitHub Pages.
 * Sequential execution: all scripts share IndexedDB state.
 */
module.exports = defineConfig({
  testDir: './',
  testMatch: 'trickle-*.spec.js',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
    ['list'],
  ],
  timeout: 120_000, // 2 min per test — seed insertion is heavy

  use: {
    baseURL: process.env.ASTRA_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Persist browser context so IndexedDB survives across tests in a spec
    launchOptions: {
      args: ['--disable-web-security'], // allow IDB in test context
    },
  },

  projects: [
    {
      name: 'trickle-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
