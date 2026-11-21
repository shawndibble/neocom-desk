/**
 * The pilot's Tax tab with two Payees (decision 20261120-235011): their corporation's Corp Tax
 * Book, whose figures are read off the book's Running account, and a personal Payee kept on the
 * device. Settle up for the book shows the Miner's one payment code and records nothing; a
 * donation counts while in flight and stays counted once the book credits it; an alt's donation
 * pays the group; a transfer to the book's corporation is never offered to a personal Payee.
 *
 * The book is read from the Firebase emulators (the `*.book.spec.ts` set). The pilot is the
 * suite's signed-in Character, a Miner of their own corporation's book (`memberSeed.ts`).
 */
import type { Page } from '@playwright/test';
import { expect, signInAsOfficer, test, type Book } from './support/taxBook/bookTest';
import { CORP } from './support/taxBook/identities';
import { DAY_TAX, isk, minerPaymentCode } from './support/taxBook/bookSeed';
import {
  PILOT,
  PILOT_ALT,
  PILOT_MINER_ID,
  creditedDonation,
  donationSent,
  memberBook,
} from './support/taxBook/memberSeed';
import {
  ROOK,
  assignment,
  payeeRecord,
  ROOK_PAYEE_ID,
  seedPersonal,
} from './support/taxBook/personalSeed';
import type { EsiOverride } from './support/taxBook/bookTest';

const CORP_NAME = 'Test Corp';
const ledgerButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Open the ledger of ${name}` });

/**
 * The book (the pilot owes three days), Rook owed two personal days, and the pilot's journal.
 * `extra` are more book docs, as the server stores them.
 */
async function openTax(
  page: Page,
  book: Book,
  esi: (answer: EsiOverride) => void,
  p: {
    journal?: ReturnType<typeof donationSent>[];
    extra?: Parameters<Book['seed']>[0];
    /** False: no personal Payee, so no seeding and reload (one page load fewer). */
    personal?: boolean;
  } = {}
) {
  const member = memberBook();
  await book.seed([...member.seed.docs(), ...(p.extra ?? [])]);
  esi(member.esi(p.journal ?? []));
  await signInAsOfficer(page, './mining/tax');
  if (p.personal === false) return member;
  await seedPersonal(page, {
    payees: [
      payeeRecord({ id: ROOK_PAYEE_ID, characterId: PILOT.id, name: ROOK.name, entityId: ROOK.id }),
    ],
    assignments: member.personalDays.map((back) =>
      assignment({ characterId: PILOT.id, payeeId: ROOK_PAYEE_ID, back })
    ),
  });
  await page.reload();
  return member;
}

test('a pilot sees what their corp book and their personal Payee are each owed', async ({
  page,
  book,
  esi,
}) => {
  const member = await openTax(page, book, esi);
  await expect(ledgerButton(page, CORP_NAME)).toContainText(isk(member.owed));
  await expect(ledgerButton(page, ROOK.name)).toContainText(isk(2 * DAY_TAX));

  await ledgerButton(page, CORP_NAME).click();
  const corp = page.getByRole('dialog', { name: CORP_NAME });
  await expect(corp).toContainText(new RegExp(`Days owed\\s*${member.bookDays.length}`));
  await expect(corp.getByRole('row', { name: /Mined at E2E Athanor Alpha/ })).toHaveCount(3);
  await page.keyboard.press('Escape');

  await ledgerButton(page, ROOK.name).click();
  const rook = page.getByRole('dialog', { name: ROOK.name });
  await expect(rook.getByRole('row', { name: /Mined at Jita/ })).toHaveCount(2);
});

test("a book's credited payment pays its oldest days on the pilot's ledger", async ({
  page,
  book,
  esi,
}) => {
  const member = await openTax(page, book, esi, {
    extra: [creditedDonation({ refId: 960_001, characterId: PILOT.id, amount: DAY_TAX, back: 2 })],
  });
  await expect(ledgerButton(page, CORP_NAME)).toContainText(isk(member.owed - DAY_TAX));
  await ledgerButton(page, CORP_NAME).click();
  const corp = page.getByRole('dialog', { name: CORP_NAME });
  // The oldest day is paid: the next one is the oldest unpaid.
  await expect(corp).toContainText(new RegExp(`Days owed\\s*${member.bookDays.length - 1}`));
  await expect(corp.getByRole('row', { name: /Payment/ })).toContainText(isk(DAY_TAX));
});

test("Settle up for the book shows the Miner's code and records nothing", async ({
  page,
  book,
  esi,
}) => {
  const member = await openTax(page, book, esi);
  // The Settle up of the book's card: the first after its owed figure.
  await ledgerButton(page, CORP_NAME)
    .locator('xpath=following::button[normalize-space()="Settle up"][1]')
    .click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${CORP_NAME}` });
  await expect(dialog).toContainText(`Amount${isk(member.owed)} ISK`);
  await expect(dialog).toContainText(`Reason${minerPaymentCode(PILOT_MINER_ID)}`);
  await expect(dialog.getByRole('status').getByRole('listitem')).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
});

test('a donation in flight counts at once and stays counted once the book credits it', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 960_002, amount: DAY_TAX, back: 1 };
  const member = await openTax(page, book, esi, {
    journal: [donationSent({ ...sent, to: CORP, reason: minerPaymentCode(PILOT_MINER_ID) })],
    personal: false,
  });
  await expect(ledgerButton(page, CORP_NAME)).toContainText(isk(member.owed - DAY_TAX));

  // The book's next sync stores it: the same transfer, now credited.
  await book.seed([creditedDonation({ ...sent, characterId: PILOT.id })]);
  await page.reload();
  await expect(ledgerButton(page, CORP_NAME)).toContainText(isk(member.owed - DAY_TAX));
});

// The book bills the pilot's group and counts the alt's donation for it; the member reads it
// by `uids` (every reader of the Miner), so the pilot's tab agrees with the book.
test("an alt's donation pays the pilot's group", async ({ page, book, esi }) => {
  const member = await openTax(page, book, esi, {
    extra: [
      creditedDonation({ refId: 960_003, characterId: PILOT_ALT.id, amount: DAY_TAX, back: 2 }),
    ],
  });
  await expect(ledgerButton(page, CORP_NAME)).toContainText(isk(member.owed - DAY_TAX));
});

test("a transfer to the book's corporation is never offered to a personal Payee", async ({
  page,
  book,
  esi,
}) => {
  await openTax(page, book, esi, {
    journal: [donationSent({ refId: 960_004, to: CORP, amount: 2 * DAY_TAX, back: 1 })],
  });
  await page
    .getByRole('region', { name: 'You owe' })
    .getByRole('button', { name: 'Link payment', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Link a wallet payment' });
  await expect(dialog).toContainText('No unlinked wallet payments found');
});
