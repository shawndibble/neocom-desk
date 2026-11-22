/**
 * The lock date (decision 20261120-235011, "a lock date"): history before the 1st of the month two
 * months back is read-only, and an officer's tab records each Miner's snapshot of it once per lock
 * date. A later load reads the snapshot and only the days after it, with the same totals.
 */
import type { Page } from '@playwright/test';
import { expect, minerFact, openMiner, signInAsOfficer, test } from './support/taxBook/bookTest';
import { closedMonthBook } from './support/taxBook/bookScenarios';
import { isk, shortDay } from './support/taxBook/bookSeed';
import { readDoc } from './support/taxBook/emulator';
import { CORP, MINER } from './support/taxBook/identities';

async function expectTotals(page: Page, book: ReturnType<typeof closedMonthBook>) {
  await expect(page.getByRole('main')).toContainText(`Owed${isk(book.owed)}`);
  await expect(minerFact(page, 'Paid')).toHaveText(isk(book.paid));
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(shortDay(book.oldestBack));
  await expect(page.getByRole('heading', { name: `Owed days · ${book.days}` })).toBeVisible();
}

test('an edit before the lock date is refused or hidden', async ({ page, book: emulator }) => {
  const book = closedMonthBook();
  await emulator.seed(book.seed.docs());
  await openMiner(page, book.minerId, MINER.ada.name);
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true });
  // Her two recent owed days can be re-rated or dismissed; the old owed day, before the lock
  // date, cannot, and nor can the old payment.
  await expect(ledger.getByRole('button', { name: /^More actions for .* Charge$/ })).toHaveCount(2);
  await expect(ledger.getByRole('button', { name: /^More actions for .* Payment$/ })).toHaveCount(
    0
  );
});

test('a snapshot is recorded once per lock date', async ({ page, book: emulator }) => {
  const book = closedMonthBook();
  await emulator.seed(book.seed.docs());
  const path = `corps/${CORP}/accounts/${book.minerId}`;
  const snapshot = async () =>
    (await readDoc(path))?.snapshot as Record<string, unknown> | undefined;
  const minersRow = page.getByRole('row', { name: new RegExp(MINER.ada.name) });
  // Only a whole-book read records snapshots (a Miner page reads one Miner's slice).
  await signInAsOfficer(page, './corp/moons/miners');
  await expect(minersRow).toBeVisible();
  await expect
    .poll(async () => {
      const stored = await snapshot();
      return (
        stored && {
          minerId: stored.minerId,
          through: stored.through,
          owed: stored.owed,
          credit: stored.credit,
          balance: stored.balance,
          paidThrough: stored.paidThrough,
          characterIds: stored.characterIds,
        }
      );
    })
    .toEqual(book.checkpoint);
  const first = (await snapshot())!.at;

  // The next visit finds this lock date's snapshot and records none.
  await page.reload();
  await expect(minersRow).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect((await snapshot())!.at).toBe(first);
});

test('a Miner read from their snapshot reads the same totals', async ({ page, book: emulator }) => {
  const book = closedMonthBook({ checkpointed: true });
  await emulator.seed(book.seed.docs());
  await openMiner(page, book.minerId, MINER.ada.name);
  // The one Payee ledger opens on the snapshot: "Balance through <day>".
  await expect(page.getByRole('table', { name: 'Ledger', exact: true })).toContainText(
    'Balance through'
  );
  await expectTotals(page, book);
});
