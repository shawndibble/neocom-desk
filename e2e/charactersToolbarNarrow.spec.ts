/**
 * The Characters toolbar (New Group / density / view mode) at 390px (#768).
 *
 * jsdom has no layout, so the unit tests can assert the controls render but
 * not that they share one row without overflow — the same reasoning
 * `filterSheetNarrow.spec.ts` and `corpBoardNarrow.spec.ts` give for running
 * this one against a real browser instead.
 */
import { test, expect } from './support/testBase';
import { CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

test('New Group, density, and view-mode controls share one row at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/characters$/);
  await expect(page.getByRole('button', { name: `Select ${CHARACTER_NAME}` })).toBeVisible();

  const newGroup = page.getByRole('button', { name: 'New group' });
  const density = page.getByRole('combobox', { name: 'Density' });
  const cards = page.getByRole('button', { name: 'Cards' });
  const table = page.getByRole('button', { name: 'Table' });
  await expect(newGroup).toBeVisible();
  await expect(density).toBeVisible();
  await expect(cards).toBeVisible();
  await expect(table).toBeVisible();

  const [newGroupBox, densityBox, cardsBox] = await Promise.all([
    newGroup.boundingBox(),
    density.boundingBox(),
    cards.boundingBox(),
  ]);
  expect(newGroupBox).not.toBeNull();
  expect(densityBox).not.toBeNull();
  expect(cardsBox).not.toBeNull();
  // Same row: vertical centers line up rather than one control wrapping onto
  // its own line below the others.
  expect(
    Math.abs(newGroupBox!.y + newGroupBox!.height / 2 - (densityBox!.y + densityBox!.height / 2))
  ).toBeLessThan(4);
  expect(
    Math.abs(densityBox!.y + densityBox!.height / 2 - (cardsBox!.y + cardsBox!.height / 2))
  ).toBeLessThan(4);

  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
});
