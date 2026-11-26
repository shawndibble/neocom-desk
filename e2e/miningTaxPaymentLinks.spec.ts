import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { MINER } from './support/taxBook/identities';
import { isk } from './support/taxBook/bookSeed';
import {
  DAY_TAX,
  ROOK,
  assignment,
  journalDonation,
  forgetPaidMarksRead,
  legacyPaidAssignment,
  openPersonalTax,
  personalLedger,
  readStore,
  rookOwed,
  ROOK_PAYEE_ID,
} from './support/taxBook/personalSeed';
import type { MiningTaxPaymentLinkRecord } from '../src/db/records';

const DAYS = [6, 5, 4];
const OWED = DAYS.length * DAY_TAX;
const ledgerButton = (page: Page) =>
  page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` });
const owedCard = (page: Page) => page.getByRole('group', { name: ROOK.name });

async function openLinkWallet(page: Page) {
  await page
    .getByRole('region', { name: 'You owe' })
    .getByRole('button', { name: 'Link payment', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Link a payment you already made' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a payment to the Payee is suggested, and linking it pays the oldest days', async ({
  page,
}) => {
  await openPersonalTax(page, rookOwed(CHARACTER_ID, DAYS), {
    characterId: CHARACTER_ID,
    mining: personalLedger(DAYS),
    journal: [
      journalDonation({
        refId: 7201,
        from: CHARACTER_ID,
        to: ROOK.id,
        amount: 2 * DAY_TAX,
        back: 1,
      }),
    ],
  });
  await page.getByRole('button', { name: 'Review' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link a payment you already made' });
  const payment = dialog.getByRole('radio', { name: new RegExp(`${isk(2 * DAY_TAX)} ISK`) });
  await expect(payment).toBeChecked();
  await expect(dialog).toContainText(`Sent to ${ROOK.name}`);
  await dialog.getByRole('button', { name: `Link to ${ROOK.name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(owedCard(page)).toContainText(isk(OWED - 2 * DAY_TAX));
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => [l.id, l.payeeId, l.amount])).toEqual([
    ['journal:7201', ROOK_PAYEE_ID, 2 * DAY_TAX],
  ]);
});

test('a payment to someone else is linked by hand', async ({ page }) => {
  await openPersonalTax(page, rookOwed(CHARACTER_ID, DAYS), {
    characterId: CHARACTER_ID,
    mining: personalLedger(DAYS),
    journal: [
      journalDonation({
        refId: 7202,
        from: CHARACTER_ID,
        to: MINER.fen.id,
        amount: DAY_TAX,
        back: 1,
      }),
    ],
  });
  const dialog = await openLinkWallet(page);
  const payment = dialog.getByRole('radio', { name: new RegExp(MINER.fen.name) });
  await expect(payment).not.toBeChecked();
  await payment.check();
  await dialog.getByRole('button', { name: `Link to ${ROOK.name}` }).click();
  await expect(dialog).toBeHidden();
  await expect(owedCard(page)).toContainText(isk(OWED - DAY_TAX));
});

test('old paid marks are read into a link and the figures stay the same', async ({ page }) => {
  const [six, five, four] = DAYS.map((back) =>
    assignment({ characterId: CHARACTER_ID, payeeId: ROOK_PAYEE_ID, back })
  );
  const payment = {
    paymentId: 'legacy-pay-1',
    amount: 2 * DAY_TAX,
    paidBack: 3,
    journalRefId: 7203,
  };
  await openPersonalTax(
    page,
    {
      payees: rookOwed(CHARACTER_ID, []).payees,
      assignments: [legacyPaidAssignment(six, payment), legacyPaidAssignment(five, payment), four],
    },
    { characterId: CHARACTER_ID, mining: personalLedger(DAYS) }
  );
  await forgetPaidMarksRead(page);
  await page.reload();
  await page.getByRole('tab', { name: 'Tax', selected: true }).waitFor();
  await expect(owedCard(page)).toContainText(isk(DAY_TAX));
  await ledgerButton(page).click();
  const ledger = page.getByRole('dialog', { name: ROOK.name });
  await expect(ledger).toContainText(new RegExp(`Owes\\s*\u2212${isk(DAY_TAX)} ISK`));
  await expect(ledger).toContainText(new RegExp(`Days owed\\s*1`));
  await expect(
    ledger.getByRole('table', { name: 'Ledger' }).getByRole('row', { name: /Payment/ })
  ).toContainText(isk(2 * DAY_TAX));
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => [l.payeeId, l.amount])).toEqual([[ROOK_PAYEE_ID, 2 * DAY_TAX]]);
});
