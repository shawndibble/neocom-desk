/**
 * The Characters toolbar (New Group / density / view mode) at 390px (#768).
 *
 * jsdom has no layout, so the unit tests can assert the controls render but
 * not that they share one row without overflow — the same reasoning
 * `filterSheetNarrow.spec.ts` and `corpBoardNarrow.spec.ts` give for running
 * this one against a real browser instead.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_NAME } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };

/**
 * Both tests here start the same way. `support/login.ts`'s helper lands on
 * /overview, and this file is about the Characters toolbar specifically.
 */
async function landOnCharactersAtPhoneWidth(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForLoadState('load');
  // A first-ever login lands on /overview (#1771); this file is about the list.
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('./characters');
  await expect(page.getByRole('button', { name: `Select ${CHARACTER_NAME}` })).toBeVisible();
}

test('picking a Character from the More sheet returns to the page you switched from, not always Overview (#1764)', async ({
  page,
}) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(/\/overview$/);

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });

  // Navigate away from Overview via the More sheet, so switching characters
  // has somewhere other than Overview to prove it returns to.
  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Wallet' }).click();
  await expect(page).toHaveURL(/\/wallet(\/|$)/);
  const walletUrl = page.url();

  // Switch characters via the More sheet's portrait+name row.
  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('link', { name: CHARACTER_NAME })
    .click();
  await expect(page).toHaveURL(/\/characters$/);

  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(walletUrl);
});

test('New Group, density, and view-mode controls share one row at 390px', async ({ page }) => {
  await landOnCharactersAtPhoneWidth(page);

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

test('the table view shows Last synced age text at 390px (#1783)', async ({ page }) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: 'Table' }).click();

  const age = page.locator('table td time').first();
  await expect(age).toBeVisible();
  await expect(age).not.toHaveText('');
});

test('the table view keeps the Name column pinned while scrolling right at 390px (#1792)', async ({
  page,
}) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: 'Table' }).click();

  const nameCell = page.locator('table tbody td').first();
  await expect(nameCell).toBeVisible();
  const scroller = page.locator('div.overflow-x-auto', { has: page.locator('table') }).last();
  const scrolled = await scroller.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    return el.scrollLeft;
  });
  // Nothing to prove if the table happens to fit this fixture.
  expect(scrolled).toBeGreaterThan(0);

  const box = await nameCell.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  expect(box!.width).toBeLessThanOrEqual(130);
});

/**
 * `hasTouch` is scoped to this block, not the file: it flips
 * `(pointer: coarse)`/`(hover: none)`, and the row-layout test above must keep
 * measuring the rendering it was written against.
 */
test.describe('Refresh all on a touch device', () => {
  test.use({ hasTouch: true });

  const REFRESH_ALL_HINT =
    'Refresh all. Pulls live data for every character. This may take a moment for a large roster.';

  test('touch-and-hold reveals the Refresh all hint at 390px', async ({ page }) => {
    await landOnCharactersAtPhoneWidth(page);

    const refreshAll = page.getByRole('button', { name: 'Refresh all' });
    await expect(refreshAll).toBeVisible();
    // The hint used to live in a native `title=`, which touch can never reveal.
    await expect(refreshAll).not.toHaveAttribute('title');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    const box = await refreshAll.boundingBox();
    expect(box).not.toBeNull();
    const touchPoint = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    // `page.touchscreen.tap()` is a tap, not a hold, so CDP drives the raw
    // touch sequence: hold past Tooltip's 500ms long-press, then *cancel*
    // rather than end it — a touchend synthesizes the click that would kick
    // off the refresh this test is only trying to read about.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint],
    });
    try {
      // `toHaveText` waits out the long-press delay on its own; `toBeVisible`
      // is what makes it "reachable" rather than merely present.
      await expect(page.getByRole('tooltip')).toHaveText(REFRESH_ALL_HINT);
      await expect(page.getByRole('tooltip')).toBeVisible();
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    }
  });
});
