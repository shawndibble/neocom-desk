import { test, expect, PHONE } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';

test.beforeEach(async ({ page }) => {
  await signInAndGoto(page);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.waitForURL(/\/skills\/plans$/);
});

test('adding a skill via the picker shows a visible confirmation, not just to a screen reader, at 390px', async ({
  page,
}) => {
  await addCaldariCruiserToNewPlan(page);
  await page.setViewportSize(PHONE);

  await page.getByPlaceholder('Search skills…').fill('Social');
  await page.getByRole('button', { name: /^Social/ }).click();
  await page.getByRole('button', { name: 'Level I', exact: true }).click();

  const status = page.getByRole('status').filter({ hasText: 'Added' });
  await expect(status).toBeVisible();
  await expect(status).toContainText('Added Social Level I');
});

test('offers a jump-to-it link that scrolls the newly added row into view, at 390px', async ({
  page,
}) => {
  await addCaldariCruiserToNewPlan(page);
  await page.setViewportSize(PHONE);

  await page.getByPlaceholder('Search skills…').fill('Social');
  await page.getByRole('button', { name: /^Social/ }).click();
  await page.getByRole('button', { name: 'Level I', exact: true }).click();

  const newRow = page.getByRole('button', { name: 'More actions for Social' });
  await expect(newRow).not.toBeInViewport();

  await page.getByRole('button', { name: 'Jump to it' }).click();
  await expect(newRow).toBeInViewport();
});
