import { defineConfig, devices } from '@playwright/test';
import { EVE_CLIENT_ID, KEY_DIR } from './e2e/support/taxBook/runEnv';

/**
 * The Corp Tax Book browser tests (`e2e/*.book.spec.ts`): the officer pages, the verify and pay
 * pages and the member tab against the real Cloud Functions and Firestore rules, run by the
 * Firebase emulators (`scripts/e2e-book/emulators.mjs`, which stubs only CCP: SSO's key set and
 * ESI's who-is-who). The browser side is mocked as in every e2e spec (`e2e/support`).
 *
 * Its own config, not a project of `playwright.config.ts`: Playwright starts every `webServer`
 * of a config whatever specs a run holds, and the main suite's dev server blanks Firebase.
 * Needs a Java runtime (the Firestore emulator is a JAR) and `npm ci --prefix functions`.
 *
 *   npx playwright test -c playwright.book.config.ts e2e/<file>.book.spec.ts --trace off
 *
 * One worker: every test wipes and seeds the one emulator database, so they run in turn.
 */
const PORT = 5197;
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /\.book\.spec\.ts$/,
  // Pays the cold servers' first compile and function load before the first test does.
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
    // The Firestore emulator speaks plain HTTP on 127.0.0.1; nothing here needs a worker.
    serviceWorkers: 'block',
  },
  webServer: [
    {
      command: 'node scripts/e2e-book/emulators.mjs',
      // A GET on a callable answers 400 once the Functions emulator has loaded it.
      url: 'http://127.0.0.1:5001/demo-neocom-desk/us-central1/corpTaxBookCall',
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      stdout: 'ignore',
      env: { E2E_BOOK_KEY_DIR: KEY_DIR, EVE_CLIENT_ID },
      // The Firestore emulator is a JVM the Firebase CLI starts in its own process group: only
      // the CLI's own shutdown (on SIGINT) stops it, so a kill would leave it holding 8080.
      gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    },
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_EVE_CLIENT_ID: EVE_CLIENT_ID,
        // Any key turns sync on; `VITE_FIREBASE_EMULATORS` points it at the emulators.
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
