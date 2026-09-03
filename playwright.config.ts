import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const DEV_PORT = 5199;
const PREVIEW_PORT = 5200;
const DEV_BASE_URL = `http://localhost:${DEV_PORT}/`;
const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}/`;

/**
 * Specs that must render the production bundle rather than the dev server.
 * One regex, used twice: the dev project ignores exactly what the built
 * project claims, so a spec belongs to one or the other and never both.
 */
const BUILT_SPECS = /\.built\.spec\.ts$/;

/**
 * Escape hatch for a local dev-server-only run.
 *
 * Playwright starts every `webServer` entry whatever `--project` or a file
 * filter says, so the preview server below otherwise makes a production
 * build a precondition of running *any* spec — and CLAUDE.md forbids
 * building locally. Left unset (the default, and what CI runs) both projects
 * run and a missing `dist/` fails loudly, which is the whole point of #205.
 * This exists only so someone iterating on a dev-server spec isn't forced
 * into a build they aren't allowed to do.
 */
const skipBuilt = process.env.E2E_SKIP_BUILT === '1';

/**
 * Build-time and dev-time env must agree, or the two projects render
 * different apps: these are baked into the bundle by `npm run build` in CI's
 * `e2e` job (see .github/workflows/ci.yml) and read from the dev server's
 * environment here.
 */
const E2E_ENV = {
  VITE_EVE_CLIENT_ID: 'e2e-fake-client',
  // Blank out Firebase so isSyncConfigured() is false in E2E — otherwise
  // triggerSync would hit the real cloud function and trip the network guard.
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_APP_ID: '',
};

const BUILT_PROJECT: NonNullable<PlaywrightTestConfig['projects']>[number] = {
  name: 'built',
  testMatch: BUILT_SPECS,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: PREVIEW_BASE_URL,
    // The built output registers a service worker (vite-plugin-pwa), which
    // would serve these specs their assets from its own precache — the
    // stale-bundle failure mode this repo already knows. Blocking it leaves
    // the CSS path untouched (the stylesheet still comes from `dist/`) while
    // removing a race that has nothing to do with what this project asserts.
    serviceWorkers: 'block',
  },
};

const PREVIEW_SERVER: NonNullable<PlaywrightTestConfig['webServer']> = {
  // Not `vite preview` directly: the wrapper refuses to start on a missing
  // or stale `dist/`, so a run without a build fails here and says why,
  // instead of asserting against yesterday's bundle and passing for the
  // wrong reason.
  command: `node scripts/e2e-preview.mjs --port ${PREVIEW_PORT} --strictPort`,
  url: PREVIEW_BASE_URL,
  // Deliberately not `!process.env.CI`, unlike the dev server. Reuse would
  // skip the wrapper — and with it the staleness guard — handing these specs
  // whatever is already on 5200. Concurrent worktrees make that a real
  // wrong-bundle hazard rather than a theoretical one, and a loud port
  // collision is the better failure.
  reuseExistingServer: false,
};

/**
 * Fully-offline E2E: every real network destination (EVE SSO, ESI, fuzzwork,
 * the EVE image server) is mocked in e2e/support — see testBase.ts. Only the
 * app's own servers, started below, are ever hit for real.
 *
 * Two projects, two servers. `chromium` runs the suite against the Vite dev
 * server, as it always has. `built` renders the same browser against `dist/`
 * served by `vite preview`, because the dev server's CSS is not the CSS
 * users get: Tailwind's `@source` scanning and the minifier both run only in
 * a real build, and until #205 nothing in CI ever rendered their output. It
 * is deliberately a thin layer — a couple of layout invariants — not a
 * second copy of the suite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    // Fixed desktop size so the left-rail nav (not the mobile tab bar) is
    // the one actually visible/interactable in the accessibility tree.
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: BUILT_SPECS,
      use: { ...devices['Desktop Chrome'], baseURL: DEV_BASE_URL },
    },
    ...(skipBuilt ? [] : [BUILT_PROJECT]),
  ],
  webServer: [
    {
      // Port 5173 is pinned+busy elsewhere; 5199 is this suite's own port.
      command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
      url: DEV_BASE_URL,
      reuseExistingServer: !process.env.CI,
      env: E2E_ENV,
    },
    ...(skipBuilt ? [] : [PREVIEW_SERVER]),
  ],
});
