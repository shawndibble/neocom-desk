import { test, expect } from './support/testBase';
import { LAZY_SDE_FILES } from '../src/sde/lazySdeFiles';

test.use({ serviceWorkers: 'allow' });

const LAZY_FILE = LAZY_SDE_FILES.find((f) => f === 'pi-system-planets.json') ?? LAZY_SDE_FILES[0];
const LAZY_SDE_URL = `/data/${LAZY_FILE}?v=e2e-offline`;
const PRECACHED_SDE_URL = '/data/blueprints.json?v=e2e-offline';

test('boots, deep-links and serves a cached lazy SDE file with no network', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('#root > *').first()).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await expect(page.getByRole('button', { name: 'Log in with EVE Online' }).first()).toBeVisible();
  const hasChunk = (name: string) =>
    page.evaluate(
      (pattern) =>
        performance
          .getEntriesByType('resource')
          .some((entry) => new RegExp(pattern).test(entry.name)),
      `/assets/${name}-[^/]+\\.js$`
    );
  await expect.poll(() => hasChunk('DemoBoard'), { timeout: 15_000 }).toBe(true);
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

  const response = await page.goto('/login?offline=1');
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('button', { name: 'Log in with EVE Online' }).first()).toBeVisible();

  const offline = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return { status: res.status, bytes: (await res.text()).length };
  }, LAZY_SDE_URL);
  expect(offline.status).toBe(200);
  expect(offline.bytes).toBeGreaterThan(0);

  const precached = await page.evaluate(
    async (url) => (await fetch(url)).status,
    PRECACHED_SDE_URL
  );
  expect(precached).toBe(200);
});
