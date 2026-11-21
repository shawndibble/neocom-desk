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
import { readDoc } from './support/taxBook/emulator';
import { CORP, MINER } from './support/taxBook/identities';

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

/**
 * Opens a Miner's page through the app (the Moons nav's Miners, then their row): the book this
 * tab already holds is read again, without a reload of the whole app.
 */
async function openMinerInApp(page: Page, name: string) {
  await page.getByRole('list', { name: 'Moons' }).getByRole('link', { name: 'Miners' }).click();
  await page
    .getByRole('table', { name: 'Miners' })
    .getByRole('row', { name: new RegExp(name) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

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

// The Miner page reads only that Miner, so the picker reads the book's Miners itself
// (`useBookMiners`): the groupings and the server's miner list, which holds every Miner an
// officer's visit to the whole book counted. That visit comes first, as it would in use. Moving
// the payment drops Bram's recorded paid-through on the server (decision 20261121-093000), so his
// days are owed again.
test('an officer moves a payment to another Miner', async ({ page }) => {
  await signInAsOfficer(page, './corp/moons/miners');
  await expect(page.getByRole('row', { name: new RegExp(MINER.cora.name) })).toBeVisible();
  await expect
    .poll(async () => {
      const list = await readDoc(`corps/${CORP}/readModels/minerList`);
      return ((list?.miners as { minerId: string }[] | undefined) ?? []).map((m) => m.minerId);
    })
    .toContain(book.id('cora'));
  // Straight to Bram's page, as a link would: the book is read for him alone.
  await page.goto(minerUrl(book.id('bram')));
  await expect(page.getByRole('table', { name: 'Account ledger' })).toBeVisible();
  await page.getByRole('button', { name: /^More actions for .* payment$/ }).click();
  await page.getByRole('menuitem', { name: 'Move to another Miner' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move a payment' });
  await dialog.getByRole('radio', { name: MINER.cora.name }).check();
  await dialog.getByRole('button', { name: 'Move payment' }).click();
  await expect(dialog).toBeHidden();
  await owed(page, book.bram.paid);

  await openMinerInApp(page, MINER.cora.name);
  await owed(page, book.cora.owed - book.bram.paid);
});

// The server re-checks roles live for `reassignPayment` (its token goes with it,
// LIVE_CHECK_ACTION_NAMES) and drops the Miner's recorded paid-through, so the days the payment
// paid are owed again.
test('an officer takes a payment off a Miner, and it waits in Needs you', async ({ page }) => {
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

  await openMinerInApp(page, MINER.lev.name);
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

  await openMinerInApp(page, MINER.dax.name);
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

// The held day says it is held, with its dispute, in Owed days and under the ledger, as Needs you does.
test("the Miner page says a disputed day is held, not that it isn't billable yet", async ({
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

  await openMinerInApp(page, MINER.dax.name);
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

  await openMinerInApp(page, MINER.ada.name);
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

// An officer's answer names only the declaration or the dispute: the Miner's Activity counts
// those too (`isMinerAuditEntry`).
test("the officer's answer to a declaration is on the Miner's own activity", async ({ page }) => {
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
  await openMinerInApp(page, MINER.ada.name);
  await expect(page.getByRole('heading', { name: /^Activity · [1-9]/ })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('No contract reached the CEO');
});
