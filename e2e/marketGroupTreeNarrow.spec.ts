/**
 * Market Browser item-finder tree touch targets (issue #1123): every row in
 * `MarketGroupTree` — the group-header disclosure and the leaf item row, at
 * every depth — was a hand-rolled `py-1` button with no height class, so it
 * rendered 24px tall at every viewport, well under the app's 44px touch
 * floor, on the Market page's only way to browse to an item on a phone.
 * Fixed with a phone-only `min-h-11 md:min-h-0` on both row shapes — on a
 * header only while it's expandable, since a disabled one is no target —
 * rather than the shared `controlHeightClassName.md` tier, whose `md:h-9`
 * would also have grown the dense desktop row.
 *
 * jsdom has no layout, so a unit test could only assert the class token is
 * present, not the rendered pixel height — the same reasoning
 * `marketCompareNarrow.spec.ts` gives for running this against a real
 * browser instead.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { loginAndSelectCharacter } from './support/login';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };
// Exactly `md` — the width at which `md:min-h-0` engages, so the one place a
// breakpoint mismatch in this fix would surface.
const MD_EDGE = { width: 768, height: 800 };

/**
 * Searches the item finder for Tritanium, which lives at
 * Manufacture & Research > Materials > Minerals. Search auto-expands the
 * matched branch, so both row shapes this spec measures — the `Minerals`
 * group header and the `Tritanium` leaf — are rendered afterwards.
 */
async function searchTritanium(page: Page) {
  await loginAndSelectCharacter(page);
  await page.goto('./market');

  await page.getByRole('searchbox', { name: 'Search items' }).fill('Tritanium');
}

/** The tree has its own scrollport (`max-h-[32rem]`), so scroll before measuring. */
async function heightOf(page: Page, name: string) {
  const row = page.getByRole('button', { name, exact: true });
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

test('item-finder tree rows meet the 44px touch floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await searchTritanium(page);

  expect(await heightOf(page, 'Minerals')).toBeGreaterThanOrEqual(44);
  expect(await heightOf(page, 'Tritanium')).toBeGreaterThanOrEqual(44);
});

test('item-finder tree rows keep their dense height at and above md (1280px)', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await searchTritanium(page);

  // Pinned to the exact dense height (`py-1` around a `text-xs` line box =
  // 24px), not a range — a band wide enough to admit a partial regression
  // toward the 36px `md:h-9` tier would defeat the point of this test.
  expect(await heightOf(page, 'Minerals')).toBe(24);
  expect(await heightOf(page, 'Tritanium')).toBe(24);
});

test('item-finder tree rows keep their dense height at exactly md (768px)', async ({ page }) => {
  await page.setViewportSize(MD_EDGE);
  await searchTritanium(page);

  expect(await heightOf(page, 'Minerals')).toBe(24);
  expect(await heightOf(page, 'Tritanium')).toBe(24);
});
