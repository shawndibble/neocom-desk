import { defineConfig, devices } from '@playwright/test';
import { EVE_CLIENT_ID, KEY_DIR } from './e2e/support/taxBook/runEnv';

const PORT = 5197;
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /\.book\.spec\.ts$/,
  globalSetup: './e2e/support/taxBook/warmUp.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/book' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
    contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: 'node scripts/e2e-book/emulators.mjs',
      url: 'http://127.0.0.1:5001/demo-neocom-desk/us-central1/corpTaxBookCall',
      reuseExistingServer: false,
      timeout: 240_000,
      stdout: 'ignore',
      env: { E2E_BOOK_KEY_DIR: KEY_DIR, EVE_CLIENT_ID },
      gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_EVE_CLIENT_ID: EVE_CLIENT_ID,
        VITE_FIREBASE_API_KEY: 'e2e-demo-key',
        VITE_FIREBASE_AUTH_DOMAIN: '',
        VITE_FIREBASE_PROJECT_ID: 'demo-neocom-desk',
        VITE_FIREBASE_APP_ID: '',
        VITE_FIREBASE_MEASUREMENT_ID: '',
        VITE_SENTRY_DSN: '',
        VITE_FIREBASE_EMULATORS: '1',
      },
    },
  ],
});
