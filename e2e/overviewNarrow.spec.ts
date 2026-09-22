/**
 * Overview board card's "Open" link touch target on a phone (issue #1070):
 * the link had no height class of its own, so its hit box was only its own
 * text/icon height (~16-17px) — well under the touch floor — even though
 * the header around it was already sized to the 44px touch tier. (`Panel`'s
 * `actions` wrapper div only hugs its content's height rather than
 * stretching to the header, so the link couldn't inherit that height for
 * free.) The fix adds `min-h-11 md:min-h-0` directly to the link: a 44px
 * floor below `md`, reset back to the original content-hugging height at
 * and above it, since desktop's box was never meant to grow.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

test('board card "Open" link meets the 44px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAndGoto(page, './overview');

  // Every board card's link shares this label — one is enough per the AC
  // ("for at least one board card"), so the first rendered card's is fine.
  const openLink = page.getByRole('link', { name: 'Open' }).first();
  await expect(openLink).toBeVisible();

  const box = await openLink.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
