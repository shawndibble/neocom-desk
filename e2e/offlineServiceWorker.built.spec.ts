/**
 * The real service worker, offline, against the **built** bundle.
 *
 * `offline.spec.ts` can't cover this: the dev server has no service worker,
 * so `setOffline` + reload there has nothing to serve the shell. Only the
 * `built` project (`vite preview` on `dist/`) has `sw.js`, which makes it the
 * one place a regression in `src/sw.ts` — a broken precache manifest, the
 * `NavigationRoute` SPA fallback, the SDE `CacheFirst` route — shows up as
 * "app won't boot offline" instead of passing CI unnoticed.
 *
 * `playwright.config.ts` blocks service workers for the `built` project so
 * the CSS specs aren't racing a precache; this file opts back in.
 *
 * Cutting the network with `context.setOffline` also blocks the preview
 * server itself, so anything that still renders was served by the worker.
 * `/styleguide` is the target page: outside `RequireCharacter`, no ESI.
 */
import { test, expect } from './support/testBase';

test.use({ serviceWorkers: 'allow' });

// A lazy (not precached, see vite.config.ts globIgnores) SDE file. Any `?v=`
// matches `isVersionedSdeData`; the route never checks the hash itself.
const LAZY_SDE_URL = '/data/shipTree.json?v=e2e-offline';

test('boots, deep-links and serves a cached lazy SDE file with no network', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('#root > *').first()).toBeVisible();

  // `ready` resolves once the worker is active, i.e. install (the precache
  // fill) finished; claiming then makes it control this already-open page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  // Fetch the lazy file online once: the worker's CacheFirst route stores it
  // (asynchronously, after the response is handed back).
  const online = await page.evaluate(async (url) => (await fetch(url)).status, LAZY_SDE_URL);
  expect(online).toBe(200);
  await expect
    .poll(() =>
      page.evaluate(
        async (url) => Boolean(await (await caches.open('sde-data')).match(url)),
        LAZY_SDE_URL
      )
    )
    .toBe(true);

  await context.setOffline(true);

  // The precached shell: a reload of the landing page.
  await page.reload();
  await expect(page.locator('#root > *').first()).toBeVisible();

  // A URL that is not in the precache: NavigationRoute -> /index.html.
  await page.goto('/styleguide');
  await expect(page.getByRole('table', { name: 'Wide DataTable sample' })).toBeVisible();

  // The lazy file is served from the `sde-data` runtime cache.
  const offline = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status, bytes: (await res.text()).length };
  }, LAZY_SDE_URL);
  expect(offline.status).toBe(200);
  expect(offline.bytes).toBeGreaterThan(0);
});
