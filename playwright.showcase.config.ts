import { defineConfig, devices } from '@playwright/test';

/**
 * Standalone config for the showcase screenshot run. Deliberately NOT the
 * e2e config: that one starts a `vite preview` webServer which requires a
 * local `dist/` build (forbidden by CLAUDE.md), and its 5199/5200 ports are
 * the e2e suite's own — `reuseExistingServer` there would silently adopt a
 * stale server. 5310 belongs to this run and nothing else.
 */
const PORT = 5310;
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './showcase',
  // One worker: every spec seeds the same IndexedDB fixture, and the run is
  // short enough that parallelism buys nothing but flake.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
    // Well above the `md:` (768px) breakpoint, so the desktop left rail —
    // not the mobile tab bar — is what renders. 2x for crisp marketing PNGs.
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_EVE_CLIENT_ID: 'showcase-fake-client',
      // Present, but pointing nowhere. `isSyncConfigured()` only tests that
      // VITE_FIREBASE_API_KEY is non-empty, and both public-contract panels
      // refuse to render at all when it is blank ("Contract search isn't
      // available"). The snapshots themselves come from seeded `esiCache`
      // rows, which are inside their freshness window — so the Firestore
      // read is never attempted, and the host is blocked besides.
      VITE_FIREBASE_API_KEY: 'showcase-not-a-real-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'showcase.invalid',
      VITE_FIREBASE_PROJECT_ID: 'showcase',
      VITE_FIREBASE_APP_ID: '1:0:web:showcase',
    },
  },
});
