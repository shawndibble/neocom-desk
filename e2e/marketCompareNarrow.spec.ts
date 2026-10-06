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
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/**
 * Fills the Compare Set the way the Market Browser does now that the tree
 * leaf has no menu: the item's Variations tab, "Compare". The set holds the
 * whole variation group, so the handle reads `Compare (N)`.
 */
async function fillCompareSet(page: Page) {
  await signInAndGoto(page);
  // Empty order books: each variation row prices itself from its own book.
  await page.route(/\/markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  // Every compared variation reads `/universe/types/{id}`; the shared mock
  // only carries a few fixture types.
  await page.route(/\/universe\/types\/\d+$/, async (route) => {
    const typeId = Number(/\/universe\/types\/(\d+)$/.exec(route.request().url())![1]);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type_id: typeId,
        name: `Type ${typeId}`,
        description: '',
        group_id: 46,
        published: true,
        dogma_attributes: [],
      }),
    });
  });
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('1MN Afterburner I');
  await page.getByRole('button', { name: '1MN Afterburner I', exact: true }).click();
  await page.getByRole('tab', { name: /^Variations/ }).click();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}

const HANDLE = /^Compare \(\d+\)$/;

test('Compare drawer handle meets the 44px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await fillCompareSet(page);

  const handle = page.getByRole('button', { name: HANDLE });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('Compare drawer handle keeps its compact height at and above md (1280px)', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await fillCompareSet(page);

  const handle = page.getByRole('button', { name: HANDLE });
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  // Pinned to the exact compact height (h-9 = 36px, Tailwind's default
  // border-box sizing), not a range — a band wide enough to admit e.g. a
  // 40px (h-10) partial regression would defeat the point of this test.
  expect(box!.height).toBe(36);
});
