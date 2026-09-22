/**
 * Settings › Notifications: the per-Character disclosure header's touch
 * target (issue #1118).
 *
 * The header row visually fills 32px, but its `<button>` was an
 * `items-center` flex child that collapsed to its own ~16.5px caret-plus-text
 * height — so a thumb aimed at the row's padding, which is most of the row,
 * missed the only control that reveals that Character's ~90 event rows.
 * Fixed with `min-h-11 ... md:min-h-0` plus the row's padding moved onto the
 * button, the same shape as `Disclosure.tsx`/#1071 and Open Orders/#1064.
 *
 * Asserted on the rendered bounding box rather than the class string; see
 * `loyaltyStoreNarrow.spec.ts` for why.
 *
 * Uses the default seeded character with no Dexie overrides: the active
 * Character's section is seeded open by `NotificationsPanel`, so the run
 * starts from `aria-expanded="true"` and collapses first.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function gotoNotificationSettings(page: Page) {
  await signInAndGoto(page, './settings#notifications');
  await page.waitForURL(/\/settings#notifications$/);
}

/** The Character's own disclosure toggle, not the "All Characters" sibling row. */
function characterToggle(page: Page) {
  return page.getByRole('button', { name: CHARACTER_NAME, exact: true });
}

test('per-Character disclosure header meets the 44px touch floor at 390px, and still expands/collapses', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  const toggle = characterToggle(page);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const expandedHeight = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  const collapsedHeight = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  expect(collapsedHeight).toBeGreaterThanOrEqual(44);

  // The padding the old button left as dead space is now inside the hit
  // area: a click 3px below the row's top edge — well clear of the name text
  // that used to be the only target — must still toggle.
  const box = await toggle.boundingBox();
  if (!box) throw new Error('toggle has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + 3);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('select-all checkboxes stay independently clickable beside the enlarged toggle at 390px', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(PHONE);

  const toggle = characterToggle(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // The toggle grew as a flex sibling rather than as an overlay, so the
  // select-all columns keep their own hit areas: toggling one must change
  // the checkbox, not the section's expanded state.
  const selectAll = page.getByRole('checkbox', {
    name: `Toggle all Overview notifications for ${CHARACTER_NAME}`,
  });
  await expect(selectAll).toBeVisible();
  const before = await selectAll.isChecked();

  await selectAll.click();
  await expect(selectAll).toBeChecked({ checked: !before });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('per-Character disclosure header drops the touch-tier floor at and above md (1280px), staying content-driven', async ({
  page,
}) => {
  await gotoNotificationSettings(page);
  await page.setViewportSize(DESKTOP);

  const toggle = characterToggle(page);
  await expect(toggle).toBeVisible();

  const height = await toggle.evaluate((el) => el.getBoundingClientRect().height);
  // `md:min-h-0` removes the floor rather than pinning a fixed height —
  // bounded to the real content-driven height (~28.5px: 16.5px of content
  // plus `py-1.5`), so a partial regression toward the touch tier can't
  // slip through a loose upper bound.
  expect(height).toBeGreaterThanOrEqual(24);
  expect(height).toBeLessThanOrEqual(36);
});
