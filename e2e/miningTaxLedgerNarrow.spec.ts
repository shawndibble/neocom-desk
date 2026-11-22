/**
 * The Payee ledger on a phone (390px, `PHONE`): opened from the owed figure on the Payee card, its
 * status, rows and running balance fit the width, and the page never scrolls sideways.
 */
import { test, expect, PHONE } from './support/testBase';
import { expectNoPageOverflow } from './support/overflow';
import { CHARACTER_ID } from './support/fixtureData';
import { isk } from './support/taxBook/bookSeed';
import {
  DAY_TAX,
  ROOK,
  journalDonation,
  openPersonalTax,
  paymentLink,
  personalLedger,
  rookOwed,
  ROOK_PAYEE_ID,
} from './support/taxBook/personalSeed';

test.use({ viewport: PHONE });

test('the Payee ledger fits a phone, its running balance on screen', async ({ page }) => {
  const data = rookOwed(CHARACTER_ID);
  data.links = [
    paymentLink({
      characterId: CHARACTER_ID,
      payeeId: ROOK_PAYEE_ID,
      refId: 7301,
      amount: DAY_TAX,
      paidBack: 2,
    }),
  ];
  await openPersonalTax(page, data, {
    characterId: CHARACTER_ID,
    mining: personalLedger([6, 5, 4]),
    journal: [
      journalDonation({ refId: 7301, from: CHARACTER_ID, to: ROOK.id, amount: DAY_TAX, back: 2 }),
    ],
  });
  await page.getByRole('button', { name: `Open the ledger of ${ROOK.name}` }).click();
  const ledger = page.getByRole('dialog', { name: ROOK.name });
  await expect(ledger).toContainText(new RegExp(`Owes\\s*${isk(2 * DAY_TAX)} ISK`));
  const width = page.viewportSize()!.width;
  const box = await ledger.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

  const payment = ledger
    .getByRole('table', { name: 'Ledger' })
    .getByRole('row', { name: /Payment/ });
  await payment.scrollIntoViewIfNeeded();
  const balance = payment.getByRole('cell').last();
  await expect(balance).toHaveText(new RegExp(isk(2 * DAY_TAX)));
  const cell = await balance.boundingBox();
  expect(cell!.x + cell!.width).toBeLessThanOrEqual(width + 1);
  await expectNoPageOverflow(page);
});
