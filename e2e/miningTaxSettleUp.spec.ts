/**
 * Settle up for a personal Payee (decision 20261120-235011, "every Payee is paid oldest first"):
 * the pilot records what they sent, one link to the Payee, and it pays the Payee's oldest unpaid
 * days; a short payment part-pays the next day, and what is over is credit. Personal data only
 * (Dexie, no Firebase), so this runs in the main suite.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import {
  DAY_TAX,
  ROOK,
  openPersonalTax,
  personalLedger,
  readStore,
  rookOwed,
} from './support/taxBook/personalSeed';
import { isk } from './support/taxBook/bookSeed';
import type { MiningTaxPaymentLinkRecord } from '../src/db/records';

const OWED = 3 * DAY_TAX;

async function openTaxTab(page: Page) {
  await openPersonalTax(page, rookOwed(CHARACTER_ID), {
    characterId: CHARACTER_ID,
    mining: personalLedger([6, 5, 4]),
  });
  await expect(page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` })).toContainText(
    isk(OWED)
  );
}

/** Settle up on Rook's card, recording `amount` (the amount owed when omitted). */
async function settleUp(page: Page, amount?: number) {
  await page
    .getByRole('region', { name: 'You owe' })
    .getByRole('button', { name: 'Settle up', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${ROOK.name}` });
  await expect(dialog).toContainText(`Amount${isk(OWED)} ISK`);
  if (amount !== undefined) {
    await dialog.getByRole('button', { name: 'Sent a different amount?' }).click();
    await dialog.getByRole('textbox', { name: 'Amount you sent' }).fill(String(amount));
  }
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog).toBeHidden();
}

test('settling up exactly pays every day, with one link to the Payee', async ({ page }) => {
  await openTaxTab(page);
  await settleUp(page);
  await expect(page.getByRole('heading', { name: 'Open · 0' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'History' }).getByRole('row', { name: /Paid/ })
  ).toHaveCount(3);
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => ({ payeeId: l.payeeId, amount: l.amount }))).toEqual([
    { payeeId: 'p-rook', amount: OWED },
  ]);
});

test('a short settle up part-pays the newest day, and the ledger shows the rest', async ({
  page,
}) => {
  await openTaxTab(page);
  await settleUp(page, 2.5 * DAY_TAX);
  const owedNow = OWED - 2.5 * DAY_TAX;
  const ledgerButton = page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` });
  await expect(ledgerButton).toContainText(isk(owedNow));
  await ledgerButton.click();
  const ledger = page.getByRole('dialog', { name: ROOK.name });
  await expect(ledger).toContainText(new RegExp(`Owes\\s*${isk(owedNow)} ISK`));
  const payment = ledger
    .getByRole('table', { name: 'Ledger' })
    .getByRole('row', { name: /Payment/ });
  await expect(payment.getByRole('cell').nth(3)).toHaveText(isk(2.5 * DAY_TAX));
  await expect(payment.getByRole('cell').nth(4)).toHaveText(isk(owedNow));
});

test('an over settle up pays every day, and the link holds all of it', async ({ page }) => {
  await openTaxTab(page);
  await settleUp(page, 3.5 * DAY_TAX);
  await expect(page.getByRole('heading', { name: 'Open · 0' })).toBeVisible();
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => l.amount)).toEqual([3.5 * DAY_TAX]);
});

test("a personal Payee's credit shows in Manage Payees", async ({ page }) => {
  await openTaxTab(page);
  await settleUp(page, 3.5 * DAY_TAX);
  await page.getByRole('button', { name: 'Payees', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manage Payees' })).toContainText(
    `${isk(0.5 * DAY_TAX)} ISK credit`
  );
});

test('a Payee in credit still opens its ledger, with the credit as its balance', async ({
  page,
}) => {
  await openTaxTab(page);
  await settleUp(page, 3.5 * DAY_TAX);
  await page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` }).click();
  const payment = page
    .getByRole('dialog', { name: ROOK.name })
    .getByRole('table', { name: 'Ledger' })
    .getByRole('row', { name: /Payment/ });
  await expect(payment.getByRole('cell').nth(4)).toHaveText(new RegExp(isk(0.5 * DAY_TAX)));
});
