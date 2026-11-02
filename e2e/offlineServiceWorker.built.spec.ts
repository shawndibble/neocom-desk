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
 * `/login` is the non-precached target page: outside `RequireCharacter`, no ESI.
 */
import { test, expect } from './support/testBase';
import { LAZY_SDE_FILES } from '../src/sde/lazySdeFiles';

test.use({ serviceWorkers: 'allow' });

// A lazy (not precached) SDE file, taken from the same list `vite.config.ts`
// ignores, so this cannot drift from the precache again. Any `?v=` matches
// `isVersionedSdeData`; the route never checks the hash itself.
const LAZY_FILE = LAZY_SDE_FILES.find((f) => f === 'pi-system-planets.json') ?? LAZY_SDE_FILES[0];
const LAZY_SDE_URL = `/data/${LAZY_FILE}?v=e2e-offline`;
// A core feature file that IS precached (docs/context/decisions/
// *-core-feature-sde-files-are-precached-for-offline.md): never fetched online
// below, yet served offline. The precache ignores the `v` parameter.
const PRECACHED_SDE_URL = '/data/blueprints.json?v=e2e-offline';

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

  // The first load ran before the worker controlled the page, so the lazy chunks the landing
  // page needs (the Login demo board, the signed-in shell's preload group) never passed through the worker's cache. Only the boot
  // graph is precached; the rest waits for the idle warm, which the offline reload below must
  // not race. Do what the warm does for the chunks this page loaded: fetch them again under the
  // worker's control (its CacheFirst route stores them), then wait until they are in Cache Storage.
  await expect(page.getByRole('button', { name: 'Log in with EVE Online' }).first()).toBeVisible();
  // The demo board mounts after the button, so let its chunks finish loading before listing them.
  await page.waitForLoadState('networkidle');
  const pageChunks = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => /\/assets\/[^/]+\.js$/.test(url))
  );
  expect(pageChunks.length).toBeGreaterThan(0);
  await page.evaluate(
    (urls) => Promise.all(urls.map((url) => fetch(url).then((response) => response.arrayBuffer()))),
    pageChunks
  );
  await expect
    .poll(() =>
      page.evaluate(
        async (urls) => (await Promise.all(urls.map((url) => caches.match(url)))).every(Boolean),
        pageChunks
      )
    )
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
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Log in with EVE Online' }).first()).toBeVisible();

  // The lazy file is served from the `sde-data` runtime cache.
  const offline = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status, bytes: (await res.text()).length };
  }, LAZY_SDE_URL);
  expect(offline.status).toBe(200);
  expect(offline.bytes).toBeGreaterThan(0);

  // A precached core file needs no prior online fetch.
  const precached = await page.evaluate(
    async (url) => (await fetch(url)).status,
    PRECACHED_SDE_URL
  );
  expect(precached).toBe(200);
});
