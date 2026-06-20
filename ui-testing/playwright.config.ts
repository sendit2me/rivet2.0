import { defineConfig, devices } from '@playwright/test';

/**
 * Regression suite for the Rivet fork's model-config UI (Feature 005, Phase A + B).
 * Drives the running editor (vite preview) — start it first, then `npx playwright test`.
 *
 * NOTE: we use the bundled Chromium (browserName: 'chromium'), NOT the 'chrome'
 * channel, because this host is ARM64 and has no Google Chrome installed.
 */
export default defineConfig({
  testDir: './tests',
  // Each test gets a fresh BrowserContext (clean localStorage), so tests do not
  // inherit profiles/skills/presets created by other tests.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.EDITOR_URL || 'http://localhost:4173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: undefined, browserName: 'chromium' },
    },
  ],
});
