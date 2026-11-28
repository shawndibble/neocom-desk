import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { CHARACTER_NAME } from './support/fixtureData';

async function landOnCharactersAtPhoneWidth(page: Page) {
  await page.setViewportSize(PHONE);
  await page.goto('./');
  await page.getByRole('button', { name: 'Log in with EVE Online' }).first().click();
  await page.waitForLoadState('load');
  await expect(page).toHaveURL(/\/overview$/);
  await page.goto('./characters');
  await expect(page.getByRole('button', { name: `Select ${CHARACTER_NAME}` })).toBeVisible();
}

test('picking a Character from the More sheet returns to the page you switched from, and picking on Characters itself stays put (#1764)', async ({
  page,
}) => {
  await landOnCharactersAtPhoneWidth(page);
  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(/\/characters$/);

  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });

  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Wallet' }).click();
  await expect(page).toHaveURL(/\/wallet\/balance$/);
  const walletUrl = page.url();

  await mobileNav.getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('link', { name: CHARACTER_NAME })
    .click();
  await expect(page).toHaveURL(/\/characters$/);

  await page.getByRole('button', { name: `Select ${CHARACTER_NAME}` }).click();
  await expect(page).toHaveURL(walletUrl);
});

test('New Group, text size, and view-mode controls share one row at 390px', async ({ page }) => {
  await landOnCharactersAtPhoneWidth(page);

  const newGroup = page.getByRole('button', { name: 'New group' });
  const density = page.getByRole('combobox', { name: 'Text size' });
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
  await expect(age).toBeVisible({ timeout: 20_000 });
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
  expect(scrolled).toBeGreaterThan(0);

  const box = await nameCell.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
  expect(box!.width).toBeLessThanOrEqual(130);
});

test('the active card shows aria-current and an Active label at 390px (#1793)', async ({
  page,
}) => {
  await landOnCharactersAtPhoneWidth(page);

  const card = page.getByText(CHARACTER_NAME).locator('xpath=ancestor::li[1]');
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(card.getByText('Active')).toBeVisible();
});

test.describe('Refresh all on a touch device', () => {
  test.use({ hasTouch: true });

  const REFRESH_ALL_HINT =
    'Refresh all. Loads fresh data for every character. A big roster can take a moment.';

  test('touch-and-hold reveals the Refresh all hint at 390px', async ({ page }) => {
    await landOnCharactersAtPhoneWidth(page);

    const refreshAll = page.getByRole('button', { name: 'Refresh all' });
    await expect(refreshAll).toBeVisible();
    await expect(refreshAll).not.toHaveAttribute('title');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    const box = await refreshAll.boundingBox();
    expect(box).not.toBeNull();
    const touchPoint = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint],
    });
    try {
      await expect(page.getByRole('tooltip')).toHaveText(REFRESH_ALL_HINT);
      await expect(page.getByRole('tooltip')).toBeVisible();
    } finally {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    }
  });
});
