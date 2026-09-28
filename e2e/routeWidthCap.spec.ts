/**
 * Corp overview, Corp Members, Corp Assets and LP Store (#2195): the only
 * routes still rendering their root at `<main>`'s full flex-1 width instead
 * of the `mx-auto max-w-6xl` cap every other data route in the app applies
 * (scope decision `20260901-172427-app-wide-page-width.md`). One spec is
 * enough to prove the shared cause is fixed — the empty LP Store is the
 * cheapest route to seed and was the worst offender cited in the issue.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';

const DESKTOP = { width: 1440, height: 900 };
const MAX_WIDTH = 1152; // max-w-6xl

test('LP Store root content is capped at max-w-6xl on desktop', async ({ page }) => {
  await signInAndGoto(page, `./wallet/loyalty/${CORPORATION_ID}`);
  await page.setViewportSize(DESKTOP);

  await expect(page.getByRole('heading', { level: 1, name: 'LP Store' })).toBeVisible();
  // `main`'s direct child is `Layout`'s own focus-management wrapper
  // (`focus:outline-none`, no width classes of its own) — the route's capped
  // root div is its child.
  const root = page.locator('main > div > div').first();

  const box = (await root.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(MAX_WIDTH);
});
