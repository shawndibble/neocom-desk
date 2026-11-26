import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const DEV_PORT = 5199;
const PREVIEW_PORT = 5200;
const DEV_BASE_URL = `http://localhost:${DEV_PORT}/`;
const PREVIEW_BASE_URL = `http://localhost:${PREVIEW_PORT}/`;

const BUILT_SPECS = /\.built\.spec\.ts$/;

const DEV_SPECS = /\.dev\.spec\.ts$/;

const BOOK_SPECS = /\.book\.spec\.ts$/;

const skipBuilt = process.env.E2E_SKIP_BUILT === '1';

const needsDevServer = !process.env.CI || process.env.E2E_NEEDS_DEV === '1';

const E2E_ENV = {
  VITE_EVE_CLIENT_ID: 'e2e-fake-client',
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: 'neocom-e2e',
  VITE_FIREBASE_APP_ID: '',
};

const BUILT_PROJECT: NonNullable<PlaywrightTestConfig['projects']>[number] = {
  name: 'built',
  testMatch: BUILT_SPECS,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: PREVIEW_BASE_URL,
    serviceWorkers: 'block',
  },
};

const PREVIEW_SERVER: NonNullable<PlaywrightTestConfig['webServer']> = {
  command: `node scripts/e2e-preview.mjs --port ${PREVIEW_PORT} --strictPort`,
  url: PREVIEW_BASE_URL,
  reuseExistingServer: false,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: skipBuilt ? [BUILT_SPECS, BOOK_SPECS] : [BUILT_SPECS, DEV_SPECS, BOOK_SPECS],
      use: skipBuilt
        ? { ...devices['Desktop Chrome'], baseURL: DEV_BASE_URL }
        : {
            ...devices['Desktop Chrome'],
            baseURL: PREVIEW_BASE_URL,
            serviceWorkers: 'block',
          },
    },
    ...(skipBuilt
      ? []
      : [
          BUILT_PROJECT,
          {
            name: 'dev',
            testMatch: DEV_SPECS,
            use: { ...devices['Desktop Chrome'], baseURL: DEV_BASE_URL },
          },
        ]),
  ],
  webServer: [
    ...(needsDevServer
      ? [
          {
            command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
            url: DEV_BASE_URL,
            reuseExistingServer: !process.env.CI,
            env: E2E_ENV,
          },
        ]
      : []),
    ...(skipBuilt ? [] : [PREVIEW_SERVER]),
  ],
});
