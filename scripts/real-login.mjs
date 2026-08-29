// One-time interactive EVE login into a persistent Playwright profile.
// The profile (.auth-profile/, gitignored) then lets automated UX/E2E
// sessions run with real character data — refresh token stays local.
import { chromium } from '@playwright/test';

const ctx = await chromium.launchPersistentContext('.auth-profile', {
  headless: false,
  viewport: { width: 1400, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('http://localhost:5173/neocom-desk/');
console.log('Log in with EVE in the window, wait for the character list, then close the browser.');
await new Promise((resolve) => ctx.on('close', resolve));
console.log('Profile saved to .auth-profile/. Done.');
