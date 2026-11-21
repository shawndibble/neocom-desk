/**
 * `globalSetup` of `playwright.book.config.ts`: one throwaway page load before the first test.
 *
 * Both servers start cold. Vite compiles the app's module graph on its first request, and the
 * Functions emulator loads its code on the first call, which together cost the first test
 * several seconds the others never pay. The verify page of an unknown token pays both: it loads
 * the app and calls the book's router, and it needs no seeded data or sign-in. Then the page
 * imports the officer route's module, which Vite compiles with everything it imports.
 */
import { chromium, type FullConfig } from '@playwright/test';
import { EMULATOR_HOSTS } from './runEnv';

export default async function warmUp(config: FullConfig): Promise<void> {
  const { baseURL, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ baseURL });
    // Like every spec, nothing leaves the machine: only the app's server and the emulators.
    const local = new Set([new URL(baseURL!).host, ...EMULATOR_HOSTS]);
    await page.route('**/*', (route) =>
      local.has(new URL(route.request().url()).host) ? route.fallback() : route.abort()
    );
    await page.goto(`./corp-tax-book/verify/${'w'.repeat(43)}`);
    await page.getByText('This link is not valid').waitFor({ timeout: 60_000 });
    // The officer pages are a lazy route: have Vite compile their module graph now.
    await page.evaluate(async (url) => {
      await import(/* @vite-ignore */ url);
    }, '/src/routes/CorpMoons.tsx');
  } finally {
    await browser.close();
  }
}
