/**
 * What an officer does to a Miner's account (decision 20261120-235011): record a payment by
 * hand, move one to another Miner, place an ambiguous donation, write a leaver's debt off, answer
 * a dispute and a declaration. Each goes through the real callable, and the test reads the
 * account the book then shows.
 */
import type { Page } from '@playwright/test';
import { expect, minerUrl, openMiner, signInAsOfficer, test } from './support/taxBook/bookTest';
import { officerBook } from './support/taxBook/bookScenarios';
import { DAY_TAX, isk, shortDay } from './support/taxBook/bookSeed';
import { MINER } from './support/taxBook/identities';

const book = officerBook();

test.beforeEach(async ({ book: emulator }) => {
  await emulator.seed(book.seed.docs());
});

const owed = (page: Page, amount: number) =>
  expect(page.getByRole('main')).toContainText(`Owed${isk(amount)}`);

/** A Needs you card on the Overview, by the words of its title. */
const card = (page: Page, title: string | RegExp) =>
  page
    .getByRole('region', { name: /Needs you/ })
    .or(page.getByRole('main'))
    .getByRole('listitem')
    .filter({ hasText: title });

/** The officer's words, in the book's Activity log (the page header's Activity panel). */
async function expectInActivity(page: Page, words: string) {
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Activity' })).toContainText(words);
}

async function openNeedsYou(page: Page) {
  await signInAsOfficer(page, './corp/moons/overview');
  await expect(page.getByRole('heading', { name: /^Needs you · \d+$/ })).toBeVisible();
}

test('an officer records a payment by hand', async ({ page }) => {
  await openMiner(page, book.id('fen'), MINER.fen.name);
  await owed(page, book.fen.owed);
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: `Record a payment for ${MINER.fen.name}` });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill('500000');
  await dialog.getByRole('button', { name: 'Record 500,000' }).click();
  await expect(dialog).toBeHidden();
  await owed(page, book.fen.owed - 500_000);
});

test('recording a transfer the book already holds is refused', async ({ page }) => {
  await openMiner(page, book.id('fen'), MINER.fen.name);
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: `Record a payment for ${MINER.fen.name}` });
  // The same sender and amount as yesterday's donation, dated today: the same transfer.
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(book.fen.donation));
  await dialog.getByRole('button', { name: `Record ${isk(book.fen.donation)}` }).click();
  await expect(dialog).toContainText('That transfer is already in the book');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await owed(page, book.fen.owed);
});

async function openMovePayment(page: Page) {
  await openMiner(page, book.id('bram'), MINER.bram.name);
  await owed(page, 0);
  await page.getByRole('button', { name: /^More actions for .* payment$/ }).click();
  await page.getByRole('menuitem', { name: 'Move to another Miner' }).click();
  return page.getByRole('dialog', { name: 'Move a payment' });
}

// Two bugs: the Miner page reads only that Miner (bookRead/scopedMiner.ts), so the picker
// (`view.miners`, BookDialogs.tsx ReassignPaymentDialog) lists no other Miner; and see below.
test.fixme('an officer moves a payment to another Miner', async ({ page }) => {
  const dialog = await openMovePayment(page);
  await dialog.getByRole('radio', { name: MINER.cora.name }).check();
  await dialog.getByRole('button', { name: 'Move payment' }).click();
  await expect(dialog).toBeHidden();
  await owed(page, book.bram.paid);

  await page.goto(minerUrl(book.id('cora')));
  await expect(page.getByRole('heading', { level: 1, name: MINER.cora.name })).toBeVisible();
  await owed(page, book.cora.owed - book.bram.paid);
});

// The server re-checks roles live for `reassignPayment`, but the client's LIVE_CHECK_ACTIONS
// (taxBook/bookClient.ts) omit it, so no access token goes and the server answers
// `live-check-required`: "That did not go through".
test.fixme('an officer takes a payment off a Miner, and it waits in Needs you', async ({
  page,
}) => {
  const dialog = await openMovePayment(page);
  await dialog.getByRole('button', { name: 'No Miner' }).click();
  await dialog.getByRole('button', { name: 'Take it off this Miner' }).click();
  await expect(dialog).toBeHidden();
  await owed(page, book.bram.paid);

  await page.goto('./corp/moons/overview');
  await expect(
    card(page, `Unmatched donation · ${isk(book.bram.paid)} from ${MINER.bram.name}`)
  ).toBeVisible();
});

test('an ambiguous donation waits in Needs you until an officer assigns it', async ({ page }) => {
  await openNeedsYou(page);
  const donation = card(
    page,
    `Unmatched donation · ${isk(book.eli.amount)} from ${MINER.eli.name}`
  );
  await expect(donation).toContainText(
    `could credit it to ${MINER.ada.name} or ${MINER.bram.name} and cannot tell which`
  );
  await donation.getByRole('button', { name: 'Assign to a Miner' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assign a donation to a Miner' });
  await dialog.getByRole('radio', { name: MINER.ada.name }).check();
  await dialog.getByRole('button', { name: `Assign ${isk(book.eli.amount)}` }).click();
  await expect(dialog).toBeHidden();
  await expect(donation).toHaveCount(0);
});

test("a write-off forgives a leaver's oldest days, with the officer's reason", async ({ page }) => {
  await openNeedsYou(page);
  const leaver = card(page, `${MINER.lev.name} left the corp · owes ${isk(book.lev.owed)}`);
  await leaver.getByRole('button', { name: 'Write off' }).click();
  const dialog = page.getByRole('dialog', { name: `Write off ${MINER.lev.name}'s balance` });
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('Left for a null-sec alliance');
  await dialog.getByRole('button', { name: `Write off ${isk(book.lev.owed)}` }).click();
  await expect(dialog).toBeHidden();
  await expect(leaver).toHaveCount(0);

  await page.goto(minerUrl(book.id('lev')));
  await owed(page, 0);
  await expect(
    page.getByRole('table', { name: 'Account ledger' }).getByRole('row', {
      name: /Written off: Left for a null-sec alliance/,
    })
  ).toContainText(isk(book.lev.owed));
});

test('a disputed day is held: payments skip it and pay the next days', async ({ page }) => {
  await openNeedsYou(page);
  await expect(
    card(
      page,
      `${MINER.dax.name} says the book recorded too much ore on ${shortDay(book.dax.heldBack)}`
    )
  ).toContainText(`${isk(DAY_TAX)} is held until`);

  await page.goto(minerUrl(book.id('dax')));
  // His 2,000,000 paid the days either side; the held day is the one left.
  await expect(page.getByRole('table', { name: 'Payments' })).toContainText(
    `Paid 2 days, from ${shortDay(book.dax.heldBack + 1)}`
  );
  const earlier = page.getByRole('table', { name: 'Earlier days' });
  await expect(earlier).toContainText(shortDay(book.dax.heldBack + 1));
  await expect(earlier).toContainText(shortDay(book.dax.heldBack - 1));
  const owedDays = page.getByRole('table', { name: 'Owed days' });
  await expect(owedDays.getByRole('row')).toHaveCount(2);
  await expect(owedDays).toContainText(shortDay(book.dax.heldBack));
});

// The held day has no status on the Miner page: the ledger leaves it out and its note counts it
// as "not billable yet" (MinerDetail.tsx, AccountLedger.tsx), while Needs you says it is held.
test.fixme("the Miner page says a disputed day is held, not that it isn't billable yet", async ({
  page,
}) => {
  await openMiner(page, book.id('dax'), MINER.dax.name);
  await expect(page.getByRole('main')).not.toContainText('not billable yet');
  await expect(page.getByRole('table', { name: 'Owed days' })).toContainText(/held/i);
});

test("waiving a dispute credits the disputed ore's tax", async ({ page }) => {
  await openNeedsYou(page);
  const dispute = card(page, new RegExp(`${MINER.dax.name} says the book recorded too much ore`));
  await dispute.getByRole('button', { name: 'Waive it' }).click();
  const dialog = page.getByRole('dialog', { name: /Waive .*disputed ore/ });
  await dialog
    .getByRole('textbox', { name: /Reason/ })
    .fill('Ledger double-counted the fleet hauler');
  await dialog.getByRole('button', { name: `Waive ${isk(book.dax.disputedTax)}` }).click();
  await expect(dialog).toBeHidden();
  await expect(dispute).toHaveCount(0);

  await page.goto(minerUrl(book.id('dax')));
  await owed(page, DAY_TAX - book.dax.disputedTax);
});

test('keeping the bill on a dispute records the reason the Miner reads', async ({ page }) => {
  await openNeedsYou(page);
  const dispute = card(page, new RegExp(`${MINER.dax.name} says the book recorded too much ore`));
  await dispute.getByRole('button', { name: 'Keep the bill' }).click();
  const dialog = page.getByRole('dialog', { name: /Keep the bill on .*dispute/ });
  await dialog
    .getByRole('textbox', { name: /Reason/ })
    .fill('The refinery ledger shows the full amount');
  await dialog
    .getByRole('textbox', { name: `What should ${MINER.dax.name} do next?` })
    .fill('Pay the day, or send a screenshot of your ore hold');
  await dialog.getByRole('button', { name: 'Keep the bill' }).click();
  await expect(dialog).toBeHidden();
  await expect(dispute).toHaveCount(0);

  await expectInActivity(page, 'The refinery ledger shows the full amount');
});

test('confirming a declaration records the payment the Miner declared', async ({ page }) => {
  await openNeedsYou(page);
  const declaration = card(page, `${MINER.ada.name} says they paid`);
  await expect(declaration).toContainText('“Sent by contract to the CEO”');
  await declaration.getByRole('button', { name: 'Confirm paid' }).click();
  const dialog = page.getByRole('dialog', { name: `Record a payment for ${MINER.ada.name}` });
  await dialog.getByRole('button', { name: `Record ${isk(book.ada.declared)}` }).click();
  await expect(dialog).toBeHidden();
  await expect(declaration).toHaveCount(0);

  await page.goto(minerUrl(book.id('ada')));
  await owed(page, book.ada.owed - book.ada.declared);
});

test('keeping the bill on a declaration records the reason the Miner reads', async ({ page }) => {
  await openNeedsYou(page);
  const declaration = card(page, `${MINER.ada.name} says they paid`);
  await declaration.getByRole('button', { name: 'Keep the bill' }).click();
  const dialog = page.getByRole('dialog', { name: /Keep the bill on .*declaration/ });
  await dialog
    .getByRole('textbox', { name: /Reason/ })
    .fill('No contract from Ada reached the CEO');
  await dialog
    .getByRole('textbox', { name: `What should ${MINER.ada.name} do next?` })
    .fill('Donate to the Master Wallet with your code');
  await dialog.getByRole('button', { name: 'Keep the bill' }).click();
  await expect(dialog).toBeHidden();
  await expect(declaration).toHaveCount(0);

  await expectInActivity(page, 'No contract from Ada reached the CEO');
});

// The Miner page's Activity ("Mail, dismissals and the audit log for this Miner") stays at
// "Nothing has happened" after an officer answers the Miner's declaration or dispute.
test.fixme("the officer's answer to a declaration is on the Miner's own activity", async ({
  page,
}) => {
  await openNeedsYou(page);
  await card(page, `${MINER.ada.name} says they paid`)
    .getByRole('button', { name: 'Keep the bill' })
    .click();
  const dialog = page.getByRole('dialog', { name: /Keep the bill on .*declaration/ });
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('No contract reached the CEO');
  await dialog
    .getByRole('textbox', { name: `What should ${MINER.ada.name} do next?` })
    .fill('Donate with your code');
  await dialog.getByRole('button', { name: 'Keep the bill' }).click();
  await expect(dialog).toBeHidden();
  await page.goto(minerUrl(book.id('ada')));
  await expect(page.getByRole('heading', { name: /^Activity · [1-9]/ })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('No contract reached the CEO');
});
