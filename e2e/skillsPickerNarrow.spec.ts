/**
 * Skill Picker's add confirmation, on a phone (issue #1704).
 *
 * The picker's "Added X" announcement was screen-reader-only (`sr-only`), so
 * a sighted pilot who added a skill far down a long queue got no visible
 * sign anything happened. It's now shown for a few seconds, with a "Jump to
 * it" link when the newly added row lands off-screen — exercised here at
 * 390px, where the queue built by `addCaldariCruiserToNewPlan` (6 rows) is
 * tall enough to push a skill added afterward below the fold.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { addCaldariCruiserToNewPlan } from './support/planHelpers';

const PHONE = { width: 390, height: 844 };

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

  // dnd-kit renders its own empty `role="status"` live region on this page
  // (`DndLiveRegion-0`) — filtered out by requiring the announcement text.
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

  const newRow = page.getByRole('button', { name: 'Remove Social' });
  await expect(newRow).not.toBeInViewport();

  await page.getByRole('button', { name: 'Jump to it' }).click();
  await expect(newRow).toBeInViewport();
});
