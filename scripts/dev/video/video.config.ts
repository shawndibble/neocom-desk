// Dev-only config for the promo-video recordings (scripts/dev/video). Not part of the e2e suite
// or CI. Headless; each spec writes its own frames and screenshots under VIDEO_OUT.
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /\.video\.ts$/,
  timeout: 0,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:5173/',
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1.5,
    colorScheme: 'dark',
    actionTimeout: 15_000,
    launchOptions: process.env.VIDEO_CHROMIUM
      ? { executablePath: process.env.VIDEO_CHROMIUM }
      : undefined,
  },
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173/',
    cwd: '../../..',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
