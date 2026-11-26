import type { Page, Request } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { installScopeGate } from './support/scopeGate';
import { CORPORATION_ID } from './support/fixtureData';
import { CORE_GRANT } from '../src/esi/scopes';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from '../src/app/routeScopes';
import { PAGE_TABS } from '../src/app/pageTabs';
import { tabPath } from '../src/lib/pageTabs';

const CONCRETE_PATH: Partial<Record<AppRoutePath, string>> = {
  '/skills/plans/:planId': '/skills/plans/e2e-missing-plan',
  '/industry/plans/:planId': '/industry/plans/e2e-missing-plan',
  '/industry/groups/:groupId': '/industry/groups/e2e-missing-group',
  '/wallet/lp-store/:corporationId': `/wallet/lp-store/${CORPORATION_ID}`,
  '/corp/assets/*': '/corp/assets/e2e-missing-location',
};

const ROUTE_PATHS = Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[];

const TAB_PATHS = Object.values(PAGE_TABS).flatMap((page) =>
  page.tabs.map((tab) => tabPath(page, tab.id))
);

const STALE_GRANT_TITLE = 'EVE no longer accepts the saved login.';
const ERROR_TITLE = 'Something went wrong';

async function expectRendersCleanlyForCoreOnly(
  page: Page,
  url: string,
  label: string
): Promise<void> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await installScopeGate(page, CORE_GRANT);
  await signInAndGoto(page, url, CORE_GRANT);

  const main = page.locator('main');
  await expect(main).toBeVisible();
  await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 });

  await expect(page.getByText(ERROR_TITLE)).toHaveCount(0);
  await expect(page.getByText(STALE_GRANT_TITLE)).toHaveCount(0);
  expect(pageErrors, `Uncaught page error(s) on ${label}: ${pageErrors.join('; ')}`).toEqual([]);
  await expect
    .poll(async () => (await main.textContent())?.trim().length ?? 0, {
      message: `${label} rendered no visible text at all`,
    })
    .toBeGreaterThan(0);
}

for (const path of ROUTE_PATHS) {
  const url = CONCRETE_PATH[path] ?? path;

  test(`${path} renders cleanly for a Core-only Character`, async ({ page }) => {
    await expectRendersCleanlyForCoreOnly(page, url, path);
  });
}

for (const url of TAB_PATHS) {
  test(`${url} (tab) renders cleanly for a Core-only Character`, async ({ page }) => {
    await expectRendersCleanlyForCoreOnly(page, url, url);
  });
}

test('Prefetch and the Foreground Poller make no calls for scopes the Core Grant does not include', async ({
  page,
}) => {
  const ungrantedHits: string[] = [];
  const esiPaths: string[] = [];
  let esiInFlight = 0;
  const isEsi = (url: string) => new URL(url).hostname === 'esi.evetech.net';
  page.on('request', (request) => {
    if (!isEsi(request.url())) return;
    esiPaths.push(new URL(request.url()).pathname);
    esiInFlight += 1;
  });
  const settle = (request: Request) => {
    if (isEsi(request.url())) esiInFlight -= 1;
  };
  page.on('requestfinished', settle);
  page.on('requestfailed', settle);
  await installScopeGate(page, CORE_GRANT, (pathname) => ungrantedHits.push(pathname));
  await page.clock.install();

  await signInAndGoto(page, '/settings', CORE_GRANT);
  await expect(page.locator('main')).toBeVisible();
  await page.clock.runFor(12_000);
  await expect.poll(() => esiPaths.some((path) => path.endsWith('/skills'))).toBe(true);
  await expect.poll(() => esiInFlight).toBe(0);

  expect(
    ungrantedHits,
    `ESI call(s) for a scope outside the Core Grant: ${ungrantedHits.join(', ')}`
  ).toEqual([]);
  expect(esiPaths.some((path) => path.endsWith('/skills'))).toBe(true);
});
