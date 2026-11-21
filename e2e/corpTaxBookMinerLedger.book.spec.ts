/**
 * The officer's Miner page on the one Payee ledger (decision 20261120-235011, "A Payee ledger"; the
 * engine's C3): the same rows a pilot reads of their own account, owed positive, newest first, so
 * the top row's balance is what the Miner owes less any credit. Rows open in place; a correction
 * or write-off an officer undoes stays, struck through, followed by its reversal; the rows an
 * officer can change carry the officer's menu.
 */
import type { Page } from '@playwright/test';
import { expect, minerLedger, openMiner, test } from './support/taxBook/bookTest';
import { closedMonthBook, minerLedgerBook, paymentBook } from './support/taxBook/bookScenarios';
import { DAY_TAX, day, isk } from './support/taxBook/bookSeed';
import { MINER } from './support/taxBook/identities';

/** The table's body rows, top (newest) first. */
const rows = (page: Page) => minerLedger(page).getByRole('rowgroup').nth(1).getByRole('row');

test('the ledger runs newest first, its top balance what the Miner owes', async ({
  page,
  book,
}) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  const all = rows(page);
  await expect(all).toHaveCount(5);
  // Owed is positive: the oldest day starts the balance at one day's tax.
  await expect(all.last()).toContainText(`Mined`);
  await expect(all.last()).toContainText(isk(DAY_TAX));
  await expect(all.first()).toContainText(/Written off by an officer/);
  await expect(all.first()).toContainText(isk(b.owed));
});

test('a Miner in credit reads a negative balance at the top', async ({ page, book }) => {
  const b = paymentBook('over');
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  const credit = b.paid - 2 * DAY_TAX;
  await expect(rows(page).first()).toContainText(/Payment/);
  // Credit reads as such, not as a minus.
  await expect(rows(page).first()).toContainText(`${isk(credit)} credit`);
});

test("a payment's row opens in place to show the days it paid", async ({ page, book }) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await rows(page)
    .filter({ hasText: /Payment/ })
    .click();
  await expect(minerLedger(page)).toContainText('Days it paid');
  await expect(minerLedger(page)).toContainText(day(6));
});

test('past a closed month the ledger opens on its balance through it', async ({ page, book }) => {
  const b = closedMonthBook({ checkpointed: true });
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  const opening = rows(page).last();
  await expect(opening).toContainText(/Balance through/);
  await expect(opening).toContainText(isk(b.checkpoint.balance));
});

test("a payment's row carries the officer's menu", async ({ page, book }) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await page.getByRole('button', { name: /^More actions for .* payment$/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Mark part not tax' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Move to another Miner' })).toBeVisible();
});

test('a reversed write-off stays struck through, followed by its reversal', async ({
  page,
  book,
}) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await page.getByRole('button', { name: /^More actions for .* writeOff$/ }).click();
  await page.getByRole('menuitem', { name: 'Reverse write-off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reverse this write-off?' });
  await dialog.getByRole('textbox', { name: 'Why' }).fill('Fleet op was not a corp op');
  await dialog.getByRole('button', { name: 'Reverse write-off' }).click();
  await expect(dialog).toBeHidden();
  const struck = rows(page).filter({ hasText: /Written off by an officer/ });
  await expect(struck).toContainText('reversed');
  await expect(struck.locator('.line-through')).toHaveCount(1);
  await expect(rows(page).first()).toContainText(/Reversal/);
});

// After the write-off is reversed the page still reads Owed 1,000,000 and "Written off 1,000,000",
// and the Reversal row's balance is the old 1,000,000: the day it forgave is not owed again.
// Likely the moved-payment bug's twin (fixed for reassign and not-tax in 1e8e110): the officer's
// visit recorded that day as paid (`meta/paid`), and `reverseWriteOff` does not drop it.
test.fixme('a reversed write-off makes the day it forgave owed again', async ({ page, book }) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await page.getByRole('button', { name: /^More actions for .* writeOff$/ }).click();
  await page.getByRole('menuitem', { name: 'Reverse write-off' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reverse this write-off?' });
  await dialog.getByRole('textbox', { name: 'Why' }).fill('Fleet op was not a corp op');
  await dialog.getByRole('button', { name: 'Reverse write-off' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main')).toContainText(`Owed${isk(b.owed + DAY_TAX)}`);
  await expect(rows(page).first().getByRole('cell').last()).toHaveText(isk(b.owed + DAY_TAX));
});

test('a reversed correction stays struck through, followed by its reversal', async ({
  page,
  book,
}) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add a correction line' }).click();
  const add = page.getByRole('dialog', { name: `Correct ${MINER.ada.name}'s bill` });
  await add.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX / 2));
  await add.getByRole('textbox', { name: 'Label on the line' }).fill('Refinery offline');
  await add.getByRole('button', { name: `Add ${isk(DAY_TAX / 2)}` }).click();
  await expect(add).toBeHidden();

  await rows(page)
    .filter({ hasText: 'Refinery offline' })
    .getByRole('button', { name: /^More actions for / })
    .click();
  await page.getByRole('menuitem', { name: 'Reverse correction' }).click();
  const reverse = page.getByRole('dialog', { name: 'Reverse this correction?' });
  await reverse.getByRole('textbox', { name: 'Why' }).fill('Refinery was online after all');
  await reverse.getByRole('button', { name: 'Reverse correction' }).click();
  await expect(reverse).toBeHidden();
  const struck = rows(page).filter({ hasText: /Refinery offline/ });
  await expect(struck).toContainText('reversed');
  await expect(rows(page).filter({ hasText: /Reversal/ })).toHaveCount(1);
  await expect(rows(page).first()).toContainText(isk(b.owed));
});

// The officer's ledger is the bare table (MinerLedger.tsx renders PayeeLedgerTable in a
// BookSection): no kind or date filters and no export, which the decision gives the one Payee
// ledger, and which the pilot's panel has (`PayeeLedgerPanel`'s FilterBar and table actions).
test.fixme("the officer's ledger filters by kind and exports as CSV", async ({ page, book }) => {
  const b = minerLedgerBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await page.getByRole('button', { name: 'Filters' }).click();
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: 'Charges' })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await page.getByRole('button', { name: /^Export / }).click();
  await expect(page.getByRole('menuitem', { name: 'Download CSV' })).toBeVisible();
});
