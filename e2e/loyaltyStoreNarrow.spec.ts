/**
 * Loyalty Store's back-to-Wallet link (issue #1095): it was a bare
 * `inline-block text-xs text-accent hover:underline` anchor — text with no box
 * of its own, so on a phone it was a ~16px-tall tap target sitting above a
 * full page of controls that all size themselves from the shared control
 * scale.
 *
 * Asserted on the rendered bounding box, not on the class string: the class
 * name only proves what was typed, while the box proves what the cascade
 * actually produced at that viewport. Width is asserted too — the link's
 * parent is a `flex flex-col`, whose default `align-items: stretch` pulls an
 * `inline-flex` control out to the full page unless it opts out.
 *
 * The route renders its chrome (header, back link, empty state) with no offers
 * at all, so the empty LP fixtures in `support/mockEsi.ts` are enough.
 */
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';
import { CORPORATION_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test('the back-to-Wallet link is a full sm-tier control (36px) at 390px', async ({ page }) => {
  await loginAndSelectCharacter(page);
  await page.goto(`./wallet/loyalty/${CORPORATION_ID}`);
  await page.setViewportSize(PHONE);

  const back = page.getByRole('link', { name: /Loyalty Points/ });
  await expect(back).toBeVisible();

  const box = await back.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(box.height).toBeGreaterThanOrEqual(36);
  // Intrinsic width, not the stretched-to-the-viewport bar the flex column
  // would otherwise produce.
  expect(box.width).toBeLessThan(PHONE.width / 2);
});

test('the back-to-Wallet link drops to the compact tier at and above md (1280px)', async ({
  page,
}) => {
  await loginAndSelectCharacter(page);
  await page.goto(`./wallet/loyalty/${CORPORATION_ID}`);
  await page.setViewportSize(DESKTOP);

  const back = page.getByRole('link', { name: /Loyalty Points/ });
  await expect(back).toBeVisible();

  // `h-7` (28px), pinned to a narrow band rather than a loose "< 36": a wide
  // upper bound would not notice the touch-tier height leaking onto desktop.
  const height = await back.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThanOrEqual(32);
});
