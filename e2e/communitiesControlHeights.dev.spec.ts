/**
 * Every Communities surface keeps its inline controls at one height (DESIGN.md
 * §3). The Blueprints tab shipped "Browse in BPC Sourcing" at `sm` beside a
 * `SearchInput` and a `SelectTrigger` at `md`; this measures each tab and My
 * sharing at desktop and phone widths so the next row can't drift the same way.
 *
 * Dev server only: the page reads its Communities from the Storybook stand-in
 * (`backendOverride.ts` + `communitiesFixture.ts`), installed by importing
 * those `/src` modules into the running app — the e2e build has no Firebase.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CONTROL_ROW_WIDTHS, expectInlineControlsAligned } from './support/controlHeights';
import type { setCommunityBackendOverride } from '../src/features/communities/backendOverride';
import type { createCommunitiesFixture } from '../src/storybook/communitiesFixture';

const ADMIN = 'sample-brass-meridian';
const MEMBER = 'sample-providence-co-op';

const SURFACES: { name: string; path: string }[] = [
  { name: 'list', path: '/communities' },
  { name: 'blueprints', path: `/communities?community=${ADMIN}` },
  { name: 'blueprints mine', path: `/communities?community=${ADMIN}&view=mine` },
  { name: 'fittings', path: `/communities?community=${ADMIN}&tab=fittings` },
  { name: 'fittings mine', path: `/communities?community=${ADMIN}&tab=fittings&view=mine` },
  { name: 'plans', path: `/communities?community=${ADMIN}&tab=plans` },
  { name: 'plans mine', path: `/communities?community=${MEMBER}&tab=plans&view=mine` },
  { name: 'members', path: `/communities?community=${ADMIN}&tab=members` },
  { name: 'invites', path: `/communities?community=${ADMIN}&tab=invites` },
];

/** Installs the sample Communities, then routes in-app so the page's loads read them. */
async function openWithSampleCommunities(page: Page, path: string): Promise<void> {
  await signInAndGoto(page, './settings');
  await expect(page.locator('main')).toBeVisible();
  await routeInApp(page, path);
}

/** Routes in-app (no re-seed), so one test can visit several surfaces. */
async function routeInApp(page: Page, path: string): Promise<void> {
  await page.evaluate(async (target) => {
    // Indirected through variables so `tsc` leaves them alone: dev-server URLs,
    // not paths this spec's module graph resolves. The casts are checked
    // against the real signatures.
    const storeUrl = '/src/features/communities/backendOverride.ts';
    const fixtureUrl = '/src/storybook/communitiesFixture.ts';
    const store = (await import(/* @vite-ignore */ storeUrl)) as {
      setCommunityBackendOverride: typeof setCommunityBackendOverride;
    };
    const fixture = (await import(/* @vite-ignore */ fixtureUrl)) as {
      createCommunitiesFixture: typeof createCommunitiesFixture;
    };
    store.setCommunityBackendOverride(fixture.createCommunitiesFixture());
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page.locator('main .animate-spin')).toHaveCount(0, { timeout: 8000 });
}

for (const width of CONTROL_ROW_WIDTHS) {
  for (const { name, path } of SURFACES) {
    test(`communities ${name}: inline controls share one height (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWithSampleCommunities(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectInlineControlsAligned(page, `${name} @${width}`);
    });
  }
}

/** Row/header rhythm: same two-line row padding as Skill plans; one-line Library headers. */
const RHYTHM_WIDTHS = [1440, 1024, 390] as const;

async function firstHeight(page: Page, selector: string): Promise<number> {
  const row = page.locator(selector).first();
  await expect(row).toBeVisible();
  // The row can re-render between the visibility check and the measurement
  // (the list swaps in place after an in-app route), leaving no box for a
  // moment; poll until it has one rather than reading it once.
  let height = 0;
  await expect
    .poll(
      async () => {
        height = (await row.boundingBox())?.height ?? 0;
        return height;
      },
      { message: selector }
    )
    .toBeGreaterThan(0);
  return height;
}

for (const width of RHYTHM_WIDTHS) {
  test(`communities Library headers share one height (${width}px)`, async ({ page }) => {
    test.skip(width === 390, 'phone layout stacks the table');
    await page.setViewportSize({ width, height: 768 });
    await openWithSampleCommunities(page, `/communities?community=${ADMIN}`);
    const heights = await page
      .locator('main table thead th')
      .evaluateAll((ths) => ths.map((th) => Math.round(th.getBoundingClientRect().height)));
    expect(heights.length).toBeGreaterThan(1);
    expect(new Set(heights).size, `header heights ${heights.join(',')}`).toBe(1);
  });

  test(`communities Fittings and list rows are at least as tall as Skill plans rows (${width}px)`, async ({
    page,
  }) => {
    test.skip(width === 390, 'phone rows keep their 44px floor, unchanged');
    await page.setViewportSize({ width, height: 900 });
    await openWithSampleCommunities(page, `/communities?community=${ADMIN}&tab=plans`);
    const planRow = await firstHeight(page, 'main ul.divide-y > li');
    await routeInApp(page, `/communities?community=${ADMIN}&tab=fittings`);
    const fittingRow = await firstHeight(page, 'main ul.divide-y > li');
    await routeInApp(page, '/communities');
    const listRow = await firstHeight(page, 'main ul.divide-y > li');
    expect(fittingRow).toBeGreaterThanOrEqual(planRow);
    expect(listRow).toBeGreaterThanOrEqual(planRow);
  });
}
