/**
 * Money on the Running account (decision 20261120-235011, GLOSSARY "Running account"): a
 * payment pays the Miner's oldest unpaid day first; a day short by no more than the book's
 * per-day tolerance closes and the gap is written off; a bigger shortfall part-pays the day; what
 * is over is credit. Read on the Miner's page (its figures and account ledger) and the Miners list.
 */
import { expect, minerFact, openMiner, signInAsOfficer, test } from './support/taxBook/bookTest';
import { DAY_TOLERANCE, paymentBook, twoRefineriesBook } from './support/taxBook/bookScenarios';
import { DAY_TAX, isk, shortDay } from './support/taxBook/bookSeed';
import { MINER } from './support/taxBook/identities';
import {
  PILOT,
  PILOT_ALT,
  PILOT_MINER_ID,
  creditedDonation,
  memberBook,
} from './support/taxBook/memberSeed';
import type { Page } from '@playwright/test';

const ledgerRow = (page: Page, name: RegExp) =>
  page.getByRole('table', { name: 'Ledger', exact: true }).getByRole('row', { name });
const minersRow = (page: Page) =>
  page
    .getByRole('table', { name: 'Miners' })
    .getByRole('row', { name: new RegExp(MINER.ada.name) });

test('an exact payment pays the oldest day and leaves the next owed', async ({ page, book }) => {
  const b = paymentBook('exact');
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await expect(page.getByRole('main')).toContainText(`Owed${isk(DAY_TAX)}`);
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(shortDay(b.newestBack));
  await expect(ledgerRow(page, /Payment from Ada Lunar/)).toContainText(
    `${isk(b.paid)}${isk(DAY_TAX)}`
  );
  await expect(page.getByRole('table', { name: 'Payments' })).toContainText(
    `Paid 1 day, from ${shortDay(b.oldestBack)}`
  );
});

test('a payment short within the tolerance closes the day and writes the gap off', async ({
  page,
  book,
}) => {
  const b = paymentBook('shortWithinTolerance');
  await book.seed(b.seed.docs());
  await signInAsOfficer(page, './corp/moons/miners');
  await expect(minersRow(page)).toContainText(`Paid through ${shortDay(b.newestBack)}`);
  await page
    .getByRole('link', { name: MINER.ada.name })
    .or(page.getByRole('cell', { name: MINER.ada.name }))
    .first()
    .click();
  const adjustment = ledgerRow(page, /Shortfall forgiven/);
  await expect(adjustment).toContainText(isk(2 * DAY_TAX - b.paid));
  expect(2 * DAY_TAX - b.paid).toBeLessThanOrEqual(DAY_TOLERANCE);
  await expect(page.getByRole('heading', { name: 'Owed days · 0' })).toBeVisible();
});

test('a payment short beyond the tolerance part-pays the next day', async ({ page, book }) => {
  const b = paymentBook('shortBeyondTolerance');
  await book.seed(b.seed.docs());
  await signInAsOfficer(page, './corp/moons/miners');
  const left = 2 * DAY_TAX - b.paid;
  await expect(minersRow(page)).toContainText(
    `Owes ${isk(left)} (1 day, oldest ${shortDay(b.newestBack)})`
  );
});

test('an overpayment pays every day and holds the rest as credit', async ({ page, book }) => {
  const b = paymentBook('over');
  await book.seed(b.seed.docs());
  await signInAsOfficer(page, './corp/moons/miners');
  const credit = b.paid - 2 * DAY_TAX;
  await expect(minersRow(page)).toContainText(`Paid through ${shortDay(b.newestBack)}`);
  await expect(minersRow(page).getByRole('cell').nth(5)).toHaveText(isk(credit));
  await minersRow(page).click();
  await expect(
    ledgerRow(page, /Payment from Ada Lunar/)
      .getByRole('cell')
      .nth(4)
  ).toHaveText(`${isk(credit)} credit`);
  await expect(page.getByRole('heading', { name: 'Owed days · 0' })).toBeVisible();
});

test('two refineries on one date are paid as one date', async ({ page, book }) => {
  const b = twoRefineriesBook();
  await book.seed(b.seed.docs());
  await openMiner(page, b.minerId, MINER.ada.name);
  await expect(page.getByRole('main')).toContainText(`Owed${isk(DAY_TAX)}`);
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(shortDay(b.owedBack));
  await expect(page.getByRole('table', { name: 'Payments' })).toContainText(
    `Paid 1 day, from ${shortDay(b.sharedBack)}`
  );
});

test("an alt's donation pays its group's oldest day", async ({ page, book }) => {
  const member = memberBook();
  await book.seed([
    ...member.seed.docs(),
    creditedDonation({ refId: 950_001, characterId: PILOT_ALT.id, amount: DAY_TAX, back: 1 }),
  ]);
  await openMiner(page, PILOT_MINER_ID, PILOT.name);
  await expect(page.getByRole('main')).toContainText(`Owed${isk(member.owed - DAY_TAX)}`);
  await expect(ledgerRow(page, new RegExp(`Payment from ${PILOT_ALT.name}`))).toBeVisible();
  await expect(page.getByRole('table', { name: 'Payments' })).toContainText(
    `Paid 1 day, from ${shortDay(member.bookDays[0])}`
  );
});
