/**
 * The closed-through checkpoint (decision 20261120-235011, "a closed-through date keeps the work
 * bounded"): an officer's tab records, for each Miner, where the account stood at the end of the
 * last month at least 31 days old, and later loads read the checkpoint and only the days after
 * it. Read either way, a Miner's page shows the same totals.
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

test("an officer's visit records the closed-through checkpoint", async ({
  page,
  book: emulator,
}) => {
  const book = closedMonthBook();
  await emulator.seed(book.seed.docs());
  // Only a whole-book read records checkpoints (a Miner page reads one Miner's slice).
  await signInAsOfficer(page, './corp/moons/miners');
  await expect(page.getByRole('row', { name: new RegExp(MINER.ada.name) })).toBeVisible();
  await expect
    .poll(async () => {
      const stored = await readDoc(`corps/${CORP}/accountCheckpoints/${book.minerId}`);
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
});

test('a Miner whose history passes a closed month reads the same totals', async ({
  page,
  book: emulator,
}) => {
  const book = closedMonthBook({ checkpointed: true });
  await emulator.seed(book.seed.docs());
  await openMiner(page, book.minerId, MINER.ada.name);
  await expect(page.getByRole('table', { name: 'Account ledger' })).toContainText(
    'Closed months, through this day'
  );
  await expectTotals(page, book);
});
