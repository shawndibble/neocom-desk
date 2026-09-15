/**
 * Compare drawer's persistent toggle handle touch target (issue #1086): the
 * handle bar (the sole way to open/collapse/re-open the drawer once the
 * Compare Set is non-empty) was a fixed `h-9` (36px) at every viewport, never
 * reaching the app's 44px touch floor on a phone — unlike every other
 * primary control, which reads its height from
 * `controlStyles.ts`'s `controlHeightClassName.md` (`h-11 md:h-9`). Fixed by
 * switching the handle to that same shared token.
 *
 * jsdom has no layout, so `CompareDrawer.test.tsx` can only assert the class
 * token is present, not the rendered pixel height — the same reasoning
 * `charactersToolbarNarrow.spec.ts` gives for running this against a real
 * browser instead.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Searches for Tritanium in the Market Browser and adds it to the Compare Set, opening the drawer's handle. */
async function addTritaniumToCompare(page: Page) {
  await loginAndSelectCharacter(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
  const item = page.getByRole('button', { name: 'Tritanium', exact: true });
  await expect(item).toBeVisible();
  await item.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Add to Compare' }).click();
}

test('Compare drawer handle meets the 44px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await addTritaniumToCompare(page);

  const handle = page.getByRole('button', { name: 'Compare (1)' });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('Compare drawer handle keeps its compact height at and above md (1280px)', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await addTritaniumToCompare(page);

  const handle = page.getByRole('button', { name: 'Compare (1)' });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  // Pinned to the exact compact height (h-9 = 36px, Tailwind's default
  // border-box sizing), not a range — a band wide enough to admit e.g. a
  // 40px (h-10) partial regression would defeat the point of this test.
  expect(box!.height).toBe(36);
});
