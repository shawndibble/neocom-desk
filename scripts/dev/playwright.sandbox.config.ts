import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /moons-sandbox\.local\.ts/,
  timeout: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173/',
    headless: false,
    viewport: null,
    launchOptions: { args: ['--start-maximized'] },
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/',
    cwd: '../..',
    reuseExistingServer: true,
    env: { VITE_FIREBASE_EMULATORS: '1' },
    timeout: 120_000,
  },
});
