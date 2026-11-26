import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CORPORATION_ID } from './support/fixtureData';

const DESKTOP = { width: 1440, height: 900 };
const MAX_WIDTH = 1152;

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
