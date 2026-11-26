import { test, expect, PHONE, DESKTOP } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const JOURNAL = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1,
  date: `2026-09-0${index + 1}T00:00:00Z`,
  ref_type: index % 2 === 0 ? 'bounty_prizes' : 'player_donation',
  description: `E2E journal entry ${index + 1}`,
  amount: 1_000_000 * (index + 1),
  balance: 50_000_000 + index,
}));

async function signInToJournal(page: import('@playwright/test').Page) {
  await page.route(
    (url) => url.pathname === `/characters/${CHARACTER_ID}/wallet/journal`,
    (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(JOURNAL) })
  );
  await signInAndGoto(page, './wallet/journal');
}

test('collapses the filters behind a trigger at 390px and commits each pick at once', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInToJournal(page);

  const trigger = page.getByRole('button', { name: /^Filters/ });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search description' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toHaveCount(0);

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('combobox', { name: 'Ref type' }).click();
  await page.getByRole('option', { name: 'Bounty prizes' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Ref type' })).toHaveText('Bounty prizes');
  await expect(dialog.getByRole('button', { name: 'Apply' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filters (1 active)' })).toBeVisible();

  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
});

test('keeps the filters behind the funnel, on the search row, on a pointer viewport', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await signInToJournal(page);

  const search = page.getByRole('searchbox', { name: 'Search description' });
  const trigger = page.getByRole('button', { name: /^Filters/ });
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toBeVisible();

  const searchBox = (await search.boundingBox())!;
  const triggerBox = (await trigger.boundingBox())!;
  const triggerMid = triggerBox.y + triggerBox.height / 2;
  expect(triggerMid).toBeGreaterThanOrEqual(searchBox.y);
  expect(triggerMid).toBeLessThanOrEqual(searchBox.y + searchBox.height);

  await trigger.click();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Filters' })).toHaveCount(0);
});
