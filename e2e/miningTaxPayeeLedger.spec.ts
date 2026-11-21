/**
 * The Payee ledger on desktop (decision 20261120-235011, "A Payee ledger"): opened from the owed
 * figure on a Payee card, every charge and payment in date order with a running balance, its
 * kind and date filters, the table export, a row opened in place, and the opening row a closed
 * month leaves. Personal data only (Dexie), so this runs in the main suite.
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { day, isk } from './support/taxBook/bookSeed';
import {
  DAY_TAX,
  ROOK,
  ROOK_PAYEE_ID,
  openPersonalTax,
  paymentLink,
  personalLedger,
  rookOwed,
} from './support/taxBook/personalSeed';

const DAYS = [6, 5, 4];
const PAID_BACK = 3;

/** Rook billed three days, one day's tax paid since: four rows, 2,000,000 owed. */
async function openLedger(page: Page) {
  const data = rookOwed(CHARACTER_ID, DAYS);
  data.links = [
    paymentLink({
      characterId: CHARACTER_ID,
      payeeId: ROOK_PAYEE_ID,
      refId: 7401,
      amount: DAY_TAX,
      paidBack: PAID_BACK,
    }),
  ];
  await openPersonalTax(page, data, { characterId: CHARACTER_ID, mining: personalLedger(DAYS) });
  await page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` }).click();
  const ledger = page.getByRole('dialog', { name: ROOK.name });
  await expect(ledger).toContainText(new RegExp(`Owes\\s*${isk(2 * DAY_TAX)} ISK`));
  return ledger;
}

const bodyRows = (ledger: ReturnType<Page['getByRole']>) =>
  ledger.getByRole('table', { name: 'Ledger' }).getByRole('rowgroup').nth(1).getByRole('row');

test('the ledger lists every charge and payment with a running balance', async ({ page }) => {
  const ledger = await openLedger(page);
  await expect(ledger).toContainText(new RegExp(`Days owed\\s*2`));
  await expect(ledger).toContainText(/Oldest unpaid/);
  const rows = bodyRows(ledger);
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText(`${day(6)}Mined at Jita${isk(DAY_TAX)}${isk(DAY_TAX)}`);
  await expect(rows.nth(3)).toContainText(
    `${day(PAID_BACK)}Payment${isk(DAY_TAX)}${isk(2 * DAY_TAX)}`
  );
});

test('the kind filter shows only payments, and clearing it brings every row back', async ({
  page,
}) => {
  const ledger = await openLedger(page);
  await ledger.getByRole('button', { name: 'Filters' }).click();
  await ledger
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: 'Charges' })
    .click();
  await expect(bodyRows(ledger)).toHaveCount(1);
  await expect(bodyRows(ledger).first()).toContainText('Payment');
  await ledger.getByRole('button', { name: 'Clear all' }).click();
  await expect(bodyRows(ledger)).toHaveCount(4);
});

test('the date range keeps only the days inside it', async ({ page }) => {
  const ledger = await openLedger(page);
  await ledger.getByRole('button', { name: 'Filters' }).click();
  await ledger.getByRole('textbox', { name: 'From' }).fill(day(5));
  await ledger.getByRole('textbox', { name: 'To' }).fill(day(4));
  await expect(bodyRows(ledger)).toHaveCount(2);
  await expect(bodyRows(ledger).nth(0)).toContainText(day(5));
  await expect(bodyRows(ledger).nth(1)).toContainText(day(4));
});

test('the ledger downloads as CSV, a line per row', async ({ page }) => {
  const ledger = await openLedger(page);
  await ledger.getByRole('button', { name: 'Export Ledger' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download CSV' }).click();
  const csv = readFileSync(await (await download).path(), 'utf8')
    .trim()
    .split(/\r?\n/);
  expect(csv).toHaveLength(5);
  expect(csv[0]).toMatch(/Date.*What.*Charged.*Credited.*Balance/);
  expect(csv[4]).toContain(day(PAID_BACK));
  expect(csv[4]).toContain('Payment');
});

test("a payment's row opens in place to show the days it paid", async ({ page }) => {
  const ledger = await openLedger(page);
  const payment = bodyRows(ledger).filter({ hasText: 'Payment' });
  await payment.click();
  await expect(ledger).toContainText('Days it paid');
  await expect(ledger).toContainText(day(6));
});

test("a personal Payee's ledger lists its whole history, with no snapshot row", async ({
  page,
}) => {
  // Two days three months ago, one of them paid then; two days this week.
  const days = [100, 99, 6, 5];
  const data = rookOwed(CHARACTER_ID, days);
  data.links = [
    paymentLink({
      characterId: CHARACTER_ID,
      payeeId: ROOK_PAYEE_ID,
      refId: 7402,
      amount: DAY_TAX,
      paidBack: 90,
    }),
  ];
  await openPersonalTax(page, data, { characterId: CHARACTER_ID, mining: personalLedger(days) });
  const owed = page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` });
  await expect(owed).toContainText(isk(3 * DAY_TAX));
  // A personal account is always built from the device's full history (no device snapshot).
  await page.reload();
  await expect(owed).toContainText(isk(3 * DAY_TAX));
  await owed.click();
  const ledger = page.getByRole('dialog', { name: ROOK.name });
  const rows = bodyRows(ledger);
  await expect(rows).toHaveCount(5);
  await expect(ledger).not.toContainText(/Balance through/);
  await expect(ledger).toContainText(day(100));
  await expect(ledger).toContainText(new RegExp(`Days owed\\s*3`));
});

test('Unlink says so with an Undo that links the same payment back', async ({ page }) => {
  const ledger = await openLedger(page);
  await bodyRows(ledger).filter({ hasText: 'Payment' }).click();
  await ledger.getByRole('button', { name: 'Unlink' }).click();
  // The payment pays nothing now: its day is owed again.
  await expect(ledger).toContainText(new RegExp(`Owes\\s*${isk(3 * DAY_TAX)} ISK`));
  const toast = page.getByRole('status').filter({ hasText: /Unlinked the .* ISK payment/ });
  await expect(toast).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(ledger).toContainText(new RegExp(`Owes\\s*${isk(2 * DAY_TAX)} ISK`));
  await expect(ledger).toContainText(`${day(PAID_BACK)}Payment`);
});
