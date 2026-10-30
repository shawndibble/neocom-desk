/**
 * Corp Board, Corp Members, Corp Assets and LP Store (#2195): the only
 * routes still rendering their root at `<main>`'s full flex-1 width instead
 * of the `mx-auto max-w-page` cap every other data route in the app applies. One spec is
 * enough to prove the shared cause is fixed — the empty LP Store is the
 * cheapest route to seed and was the worst offender cited in the issue.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';

const DESKTOP = { width: 1440, height: 900 };
const MAX_WIDTH = 1152; // 72rem, the `page` Modal's width

test('the LP Store modal is capped at the page Modal width (72rem) on desktop', async ({
  page,
}) => {
  await signInAndGoto(page, `./wallet/lp-store/${CORPORATION_ID}`);
  await page.setViewportSize(DESKTOP);

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(MAX_WIDTH);
});
