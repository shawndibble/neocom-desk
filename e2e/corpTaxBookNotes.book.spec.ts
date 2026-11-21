/**
 * The words a pilot and the officers leave each other on a Corp Tax Book (decision
 * 20261120-235011): a pilot's reason for not paying a day ("Tell the corporation why"), a pilot's
 * note on "I already paid", an officer's label on a correction, and an officer's note on a
 * payment recorded by hand. Each reaches the other side where they read it, and the book's
 * Activity log.
 *
 * The pilot is the suite's signed-in Character, a Miner of their own corporation's book, and
 * also its officer (`memberSeed.ts`): one session plays both parts.
 */
import type { Page } from '@playwright/test';
import { expect, minerUrl, signInAsOfficer, test } from './support/taxBook/bookTest';
import { DAY_TAX, isk } from './support/taxBook/bookSeed';
import { OFFICER } from './support/taxBook/identities';
import { PILOT, PILOT_MINER_ID, notesBook } from './support/taxBook/memberSeed';

const CORP_NAME = 'Test Corp';

test.beforeEach(async ({ book, esi }) => {
  const notes = notesBook();
  await book.seed(notes.seed.docs());
  esi(notes.esi);
  // A declaration also goes to the tax contact as an EVE mail, from the pilot's Character.
  esi((path, route) =>
    path === `/characters/${OFFICER.id}/mail` && route.request().method() === 'POST'
      ? 700_000_002
      : undefined
  );
});

async function openTaxTab(page: Page) {
  await signInAsOfficer(page, './mining/tax');
  await expect(page.getByRole('button', { name: `Open the ledger of ${CORP_NAME}` })).toBeVisible();
}

/** The officer's side: Needs you on the Overview (reached in-app, no reload), and its Activity log. */
async function openNeedsYou(page: Page) {
  const moons = page.getByRole('list', { name: 'Moons' });
  // The rail lists Moons' pages only while one is open.
  if (!(await moons.isVisible())) await page.getByRole('link', { name: /^Moons/ }).click();
  await moons.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: /^Needs you · \d+$/ })).toBeVisible();
}

async function expectInActivity(page: Page, words: string) {
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Activity' })).toContainText(words);
}

/** The pilot hides a billed day as not paying and tells the corporation why. */
async function tellWhyNotPaying(page: Page, why: string) {
  await openTaxTab(page);
  await page
    .getByRole('button', { name: /^More actions for .* in Amarr$/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'View details' }).click();
  await page.getByRole('dialog').first().getByRole('button', { name: 'Resolve' }).last().click();
  const dialog = page.getByRole('dialog', { name: /bills this day/ });
  await dialog.getByRole('radio', { name: /Not paying/ }).check();
  await dialog.getByRole('checkbox', { name: `Tell ${CORP_NAME} why` }).check();
  await dialog.getByRole('textbox', { name: 'Why, in your own words' }).fill(why);
  await dialog.getByRole('button', { name: 'Hide it and tell them' }).click();
  await expect(dialog).toContainText(`Sent to ${CORP_NAME}`);
  await dialog.getByRole('button', { name: 'Done' }).click();
}

/** The pilot answers the overdue late notice with "I already paid", and a note. */
async function declarePaid(page: Page, note: string) {
  await openTaxTab(page);
  await page.getByRole('button', { name: /1 thing needs attention/ }).click();
  await page.getByRole('main').getByRole('button', { name: 'Resolve' }).first().click();
  const dialog = page.getByRole('dialog', { name: /Late notice/ });
  await dialog.getByRole('radio', { name: /I already paid/ }).check();
  await dialog.getByRole('textbox', { name: 'Add a note (optional)' }).fill(note);
  await dialog.getByRole('button', { name: 'Send proof' }).click();
  await expect(dialog).toContainText(`Sent to ${CORP_NAME}`);
  await dialog.getByRole('button', { name: 'Done' }).click();
}

const WHY = 'That ore went to the alliance buyback';
const NOTE = 'Paid by contract to the CEO on the 25th';

test("a pilot's reason for not paying a day reaches the officers", async ({ page }) => {
  await tellWhyNotPaying(page, WHY);
  await openNeedsYou(page);
  await expect(
    page.getByRole('listitem').filter({ hasText: `${PILOT.name} isn't paying` })
  ).toContainText(WHY);
});

// The Activity entry words the dispute by its kind and shows the pilot's reason (useAuditWords).
test("a pilot's reason for not paying is in the Activity log", async ({ page }) => {
  await tellWhyNotPaying(page, WHY);
  await openNeedsYou(page);
  await expectInActivity(page, WHY);
});

test("a pilot's note on a payment made another way reaches the officers", async ({ page }) => {
  await declarePaid(page, NOTE);
  await openNeedsYou(page);
  await expect(
    page.getByRole('listitem').filter({ hasText: `${PILOT.name} says they paid` })
  ).toContainText(`“${NOTE}”`);
});

// The Activity entry shows the declaration's note and amount (useAuditWords).
test("a pilot's note on a payment made another way is in the Activity log", async ({ page }) => {
  await declarePaid(page, NOTE);
  await openNeedsYou(page);
  await expectInActivity(page, NOTE);
});

test("an officer's label on a correction reaches the pilot's ledger", async ({ page }) => {
  const label = 'Refund: refinery was offline that day';
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await expect(page.getByRole('heading', { level: 1, name: PILOT.name })).toBeVisible();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add a correction line' }).click();
  const dialog = page.getByRole('dialog', { name: `Correct ${PILOT.name}'s bill` });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX / 2));
  await dialog.getByRole('textbox', { name: 'Label on the line' }).fill(label);
  await dialog.getByRole('button', { name: `Add ${isk(DAY_TAX / 2)}` }).click();
  await expect(dialog).toBeHidden();
  await openNeedsYou(page);
  await expectInActivity(page, label);

  await page.goto('./mining/tax');
  await page.getByRole('button', { name: `Open the ledger of ${CORP_NAME}` }).click();
  await expect(page.getByRole('dialog', { name: CORP_NAME })).toContainText(label);
});

// Record a payment takes a note, and the officer's Miner page, ledger and Activity show it; so
// does the pilot's ledger, beside the payment.
test("an officer's note on a hand-recorded payment reaches the pilot", async ({ page }) => {
  const note = 'Handed over in person at the staging Fortizar';
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: `Record a payment for ${PILOT.name}` });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX));
  await dialog.getByRole('textbox', { name: /Note/ }).fill(note);
  await dialog.getByRole('button', { name: `Record ${isk(DAY_TAX)}` }).click();
  await openNeedsYou(page);
  await expectInActivity(page, note);
  await page.goto('./mining/tax');
  await page.getByRole('button', { name: `Open the ledger of ${CORP_NAME}` }).click();
  await expect(page.getByRole('dialog', { name: CORP_NAME })).toContainText(note);
});
