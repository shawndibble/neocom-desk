/**
 * `FilterBar`'s mobile sheet at 390px, against the dev server.
 *
 * Two of its three claims are invisible to jsdom, which has no layout and no
 * top layer:
 *
 * - A Radix `Select` opened inside `Modal` must render *above* the dialog and
 *   take a click. `Modal` runs on `showModal()`, so the dialog sits in the
 *   browser's top layer with everything outside it inert; Radix's default
 *   portal target (`document.body`) is neither. The unit test can assert the
 *   list lands inside the dialog element, but only a real browser has a top
 *   layer to get this wrong in.
 * - Collapsing the row must not cost horizontal overflow. Same
 *   `scrollWidth <= clientWidth` assertion `productionCss.built.spec.ts`
 *   established.
 *
 * The target is the signed-in Wallet Journal (`/wallet/journal`), whose
 * `FilterBar` carries the search box and the "Ref type" select, fed by seeded
 * sign-in and a mocked journal answer.
 */
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

/** Answer the journal before sign-in: boot prefetch would cache the shared mock's empty list. */
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
  // The search box never moves into the sheet.
  await expect(page.getByRole('searchbox', { name: 'Search description' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toHaveCount(0);

  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await expect(dialog).toBeVisible();

  // The select's list has to clear the dialog's top layer to be clickable.
  await dialog.getByRole('combobox', { name: 'Ref type' }).click();
  await page.getByRole('option', { name: 'Bounty prizes' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Ref type' })).toHaveText('Bounty prizes');
  // Committed already, with no Apply step: the funnel behind counts it.
  await expect(dialog.getByRole('button', { name: 'Apply' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  // Focus returns to the funnel; that must not pop its tooltip over the neighbours.
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  // One filter away from its default, stated as a number on the trigger.
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
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toHaveCount(0);

  // One line: the trigger's vertical centre sits within the search box.
  const searchBox = (await search.boundingBox())!;
  const triggerBox = (await trigger.boundingBox())!;
  const triggerMid = triggerBox.y + triggerBox.height / 2;
  expect(triggerMid).toBeGreaterThanOrEqual(searchBox.y);
  expect(triggerMid).toBeLessThanOrEqual(searchBox.y + searchBox.height);

  // A box under the row, not a sheet: no dialog, controls commit directly.
  await trigger.click();
  await expect(page.getByRole('combobox', { name: 'Ref type' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toHaveCount(0);
});
