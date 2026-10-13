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
