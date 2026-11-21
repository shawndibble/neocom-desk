/**
 * The closed-through checkpoint (decision 20261120-235011, "a closed-through date keeps the work
 * bounded"): an officer's tab records, for each Miner, where the account stood at the end of the
 * last month at least 31 days old, and later loads read the checkpoint and only the days after
 * it. Read either way, a Miner's page shows the same totals.
 */
import type { Page } from '@playwright/test';
import {
  expect,
  minerFact,
  openMiner,
  signInAsOfficer,
  test,
  minerLedger,
} from './support/taxBook/bookTest';
import { closedMonthBook } from './support/taxBook/bookScenarios';
import { DAY_TAX, day, isk, shortDay } from './support/taxBook/bookSeed';
import { RUNNING_ACCOUNT_CHECKPOINTS } from '../functions/src/corpTaxBookVersionKeys';
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
      const stored = await readDoc(`corps/${CORP}/${RUNNING_ACCOUNT_CHECKPOINTS}/${book.minerId}`);
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
  // The one Payee ledger opens on the checkpoint: "Balance through <day>".
  await expect(minerLedger(page)).toContainText('Balance through');
  await expectTotals(page, book);
});

/** The Miner's stored checkpoint, or null once the server dropped it. */
const storedCheckpoint = (minerId: string) =>
  readDoc(`corps/${CORP}/${RUNNING_ACCOUNT_CHECKPOINTS}/${minerId}`);

test('a payment dated in a closed month drops the checkpoint, and the account is worked again', async ({
  page,
  book: emulator,
}) => {
  const book = closedMonthBook({ checkpointed: true });
  await emulator.seed(book.seed.docs());
  await openMiner(page, book.minerId, MINER.ada.name);
  await expectTotals(page, book);
  // One day's tax paid by hand, dated inside the closed month: it pays the old owed day.
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: `Record a payment for ${MINER.ada.name}` });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX));
  await dialog.getByLabel('Date paid (EVE time)').fill(day(95));
  await dialog.getByRole('button', { name: `Record ${isk(DAY_TAX)}` }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => storedCheckpoint(book.minerId)).toBeNull();
  await expect(page.getByRole('main')).toContainText(`Owed${isk(book.owed - DAY_TAX)}`);
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(shortDay(20));
});

test('a Director reopens the closed months, and the totals stand', async ({
  page,
  book: emulator,
}) => {
  const book = closedMonthBook({ checkpointed: true });
  await emulator.seed(book.seed.docs());
  await openMiner(page, book.minerId, MINER.ada.name);
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reopen closed months' }).click();
  await expect(page.getByRole('main')).toContainText(
    `Months closed through ${shortDay(Math.round((Date.now() - Date.parse(book.checkpoint.through)) / 86_400_000))} reopened`
  );
  await expect.poll(() => storedCheckpoint(book.minerId)).toBeNull();
  await expect(minerLedger(page)).not.toContainText('Balance through');
  await expectTotals(page, book);
});
