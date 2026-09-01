import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
const BASE_URL = `http://localhost:${PORT}/`;

/**
 * Fully-offline E2E: every real network destination (EVE SSO, ESI, fuzzwork,
 * the EVE image server) is mocked in e2e/support — see testBase.ts. Only the
 * app's own dev server, started below, is ever hit for real.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // Fixed desktop size so the left-rail nav (not the mobile tab bar) is
    // the one actually visible/interactable in the accessibility tree.
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Port 5173 is pinned+busy elsewhere; 5199 is this suite's own port.
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_EVE_CLIENT_ID: 'e2e-fake-client',
      // Blank out Firebase so isSyncConfigured() is false in E2E — otherwise
      // triggerSync would hit the real cloud function and trip the network guard.
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
    },
  },
});
