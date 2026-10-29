/**
 * The Customize permissions dialog's Submit/Cancel stay reachable on a phone
 * (issue #1774). The dialog is 13 Permission checkboxes long, so at 390×844 its
 * scroll region overflows; the action bar is the Modal `footer`, pinned below
 * that region, so it must sit inside the viewport without scrolling and be a
 * 36px touch target.
 */
import { test, expect, PHONE } from './support/testBase';

test('Customize permissions footer is reachable without scrolling at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with custom permissions' }).first().click();

  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: 'Log in with selected permissions' });
  await expect(submit).toBeVisible();
  await expect(dialog.getByText('Required').first()).toBeVisible();

  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(36);
  expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);

  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeInViewport();
});
