/**
 * Issue #1521: once a Character can hold only the Core Grant (skills, skill
 * queue, structure lookup, search — `src/esi/scopes.ts`'s `CORE_GRANT`), many
 * pages that have always assumed the rest of the Base Grant must still render
 * something sane instead of quietly breaking. This sweeps every route in
 * `ROUTE_REQUIREMENTS` as a Core-only Character and asserts each one renders
 * either its content or a grant banner — never an uncaught error, an infinite
 * spinner, a blank panel, or the shell's runtime auth-failure notice (which
 * exists for a *revoked* scope, not a Permission never granted at all — see
 * docs/context/decisions/20260831-140406-the-whole-app-sits-behind-authentication.md).
 *
 * `installScopeGate` makes the already-permissive `mockEsi.ts` 403 anything
 * outside the seeded grant, the same way ESI itself would for a missing
 * scope — `mockEsi.ts` alone answers 200 to any token, so without this a
 * Core-only sweep would find nothing.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { installScopeGate } from './support/scopeGate';
import { CORPORATION_ID } from './support/fixtureData';
import { CORE_GRANT } from '../src/esi/scopes';
import { ROUTE_REQUIREMENTS, type AppRoutePath } from '../src/app/routeScopes';
import { PAGE_TABS } from '../src/app/pageTabs';
import { tabPath } from '../src/lib/pageTabs';

/**
 * Concrete URL for a route whose path carries a dynamic segment. The id need
 * not resolve to anything real: `SkillPlanEditor`/`IndustryGroupPage` redirect
 * a genuinely-missing id to their list route rather than erroring, and the two
 * `/assets`-shaped splats render the exact same `ScopeGate`-replaced component
 * as their non-splat base regardless of the segment (routeScopes.ts).
 */
const CONCRETE_PATH: Partial<Record<AppRoutePath, string>> = {
  '/skills/plans/:planId': '/skills/plans/e2e-missing-plan',
  '/industry/plans/:planId': '/industry/plans/e2e-missing-plan',
  '/industry/groups/:groupId': '/industry/groups/e2e-missing-group',
  '/wallet/loyalty/:corporationId': `/wallet/loyalty/${CORPORATION_ID}`,
  '/assets/*': '/assets/e2e-missing-location',
  '/corp/assets/*': '/corp/assets/e2e-missing-location',
};

const ROUTE_PATHS = Object.keys(ROUTE_REQUIREMENTS) as AppRoutePath[];

/**
 * Every tab of every tabbed page (`pageTabs.ts`), e.g. `/wallet/journal` and
 * `/industry/jobs` — a tab switch doesn't remount the page (`TabRoute`), but
 * each tab's own panel is a distinct surface with its own scope needs (the
 * default tab alone would miss Wallet's Journal, Industry's Jobs, Contracts'
 * History, and so on).
 */
const TAB_PATHS = Object.values(PAGE_TABS).flatMap((page) =>
  page.tabs.map((tab) => tabPath(page, tab.id))
);

/** reauth.staleGrantTitle — the shell's own runtime auth-failure notice, never a route's own ReauthBanner. */
const STALE_GRANT_TITLE = 'EVE access was refused';
/** error.title — the ErrorBoundary fallback for an uncaught render throw. */
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
  // Lets esi/cache.ts's 250ms stale-grace race and any panel's own
  // needsReauth round trip settle before asserting nothing is still
  // spinning.
  await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 10_000 });

  await expect(page.getByText(ERROR_TITLE)).toHaveCount(0);
  await expect(page.getByText(STALE_GRANT_TITLE)).toHaveCount(0);
  expect(pageErrors, `Uncaught page error(s) on ${label}: ${pageErrors.join('; ')}`).toEqual([]);
  // The absence checks above pass just as easily for a silently blank panel
  // as for real content or a banner — a route that renders nothing at all
  // (a caught error swallowed with no fallback, an empty conditional) would
  // slip through every one of them. This is the positive half: something
  // legible actually painted. Polled, not a one-shot read: a route that
  // redirects (e.g. /skills -> /skills/plans) or re-renders after the spinner
  // check above can leave `main` briefly empty on the very next microtask.
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
  page.on('request', (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.hostname === 'esi.evetech.net') esiPaths.push(requestUrl.pathname);
  });
  await installScopeGate(page, CORE_GRANT, (pathname) => ungrantedHits.push(pathname));

  // /settings makes no ESI call of its own (device-local preferences only —
  // routeScopes.ts), which isolates Prefetch's and the Foreground Poller's
  // own boot-time calls (App.tsx / ForegroundNotificationPoller, both firing
  // once at mount) from a panel's expected attempt-then-403 degrade, which
  // this assertion is not about.
  await signInAndGoto(page, '/settings', CORE_GRANT);
  await expect(page.locator('main')).toBeVisible();
  // Both run fire-and-forget at mount with no page signal of their own; give
  // them time to finish rather than asserting on whatever has landed so far.
  await page.waitForTimeout(2000);

  expect(
    ungrantedHits,
    `ESI call(s) for a scope outside the Core Grant: ${ungrantedHits.join(', ')}`
  ).toEqual([]);
  // Guards against a vacuous pass: proves Prefetch actually ran, rather than
  // the grant simply never being exercised at all.
  expect(esiPaths.some((path) => path.endsWith('/skills'))).toBe(true);
});
