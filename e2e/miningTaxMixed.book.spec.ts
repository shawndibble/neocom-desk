import type { Page } from '@playwright/test';
import {
  expect,
  minerFact,
  minerUrl,
  openMiner,
  signInAsOfficer,
  test,
} from './support/taxBook/bookTest';
import { BookSeed, DAY_TAX, day, isk, minerPaymentCode } from './support/taxBook/bookSeed';
import { readCollection, readDoc } from './support/taxBook/emulator';
import { CORP, MINER, OUTSIDE_CORP, corpOf, solo } from './support/taxBook/identities';
import {
  ALT_B,
  OTHER_CORP,
  PILOT,
  PILOT_MINER_ID,
  creditedDonation,
  donationSent,
} from './support/taxBook/memberSeed';
import { justNow } from './support/taxBook/timingScenarios';
import {
  CINDER,
  CINDER_PAYEE_ID,
  conflictScenario,
  guestAltScenario,
  historyMovesOverScenario,
  leaverScenario,
  openMixed,
  overlapScenario,
  twoBooksScenario,
  twoPayeesScenario,
} from './support/taxBook/mixedScenarios';
import { ROOK, ROOK_PAYEE_ID, readStore } from './support/taxBook/personalSeed';
import type { MiningTaxPaymentLinkRecord } from '../src/db/records';

const CORP_NAME = 'Test Corp';
const ledgerButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Open the ledger of ${name}` });
const cardOf = (page: Page, name: string) => page.getByRole('group', { name });
const settleUpOf = (page: Page, name: string) =>
  cardOf(page, name).getByRole('button', { name: 'Settle up' });
const openRows = (page: Page) => page.getByRole('row').filter({ hasText: /\d{4}-\d{2}-\d{2}/ });
const ledgerOf = (page: Page, name: string) => page.getByRole('dialog', { name });

test('ore a book and a Default System Payee both could claim is billed once, each its share', async ({
  page,
  book,
  esi,
}) => {
  const s = overlapScenario();
  await openMixed(page, s, book, esi);

  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.bookOwes));
  await expect(cardOf(page, ROOK.name)).toContainText(isk(s.rookOwes));
  await expect(page.getByRole('region', { name: 'You owe' })).toContainText(
    `${isk(s.bookOwes + s.rookOwes)} ISK`
  );

  const day6 = openRows(page).filter({ hasText: day(6) });
  await expect(day6).toHaveCount(2);
  await expect(day6.filter({ hasText: CORP_NAME })).toContainText(`${isk(0.6 * DAY_TAX)} ISK`);
  await expect(day6.filter({ hasText: ROOK.name })).toContainText(`${isk(0.4 * DAY_TAX)} ISK`);
  const day4 = openRows(page).filter({ hasText: day(4) });
  await expect(day4.filter({ hasText: /Unattributed/i })).toContainText('—');
  await expect(day4.filter({ hasText: CORP_NAME })).toContainText(`${isk(0.6 * DAY_TAX)} ISK`);

  await ledgerButton(page, ROOK.name).click();
  const rookLedger = ledgerOf(page, ROOK.name);
  await expect(rookLedger).toContainText(new RegExp(`Owes\\s*\u2212${isk(s.rookOwes)} ISK`));
  await expect(rookLedger.getByRole('row', { name: /Mined at/ })).toHaveCount(1);
  await expect(rookLedger.getByRole('row', { name: /Mined at/ })).toContainText(isk(s.rookOwes));
  await page.keyboard.press('Escape');
  await ledgerButton(page, CORP_NAME).click();
  const corp = ledgerOf(page, CORP_NAME);
  await expect(corp.getByRole('row', { name: /Mined at/ })).toHaveCount(s.bookDays);
});

test('ore a Default System Payee was given and the book also recorded is a Conflict, not a second bill', async ({
  page,
  book,
  esi,
}) => {
  const s = conflictScenario();
  await openMixed(page, s, book, esi);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(DAY_TAX));
  await expect(cardOf(page, ROOK.name)).toHaveCount(0);
  await expect(page.getByText(/across \d+ payees/)).toHaveCount(0);
  const conflicts = page.getByText('Conflicts', { exact: true }).locator('xpath=ancestor::*[3]');
  await expect(conflicts).toContainText(isk(DAY_TAX));
  await expect(conflicts).toContainText(/not owed yet/i);
  const rows = openRows(page).filter({ hasText: day(5) });
  await expect(rows.filter({ hasText: /Conflict/i })).toHaveCount(1);
  await expect(rows.filter({ hasText: ROOK.name })).toContainText(/Outstanding/i);
});

test('paying the book does not pay a personal Payee, and paying the Payee does not pay the book', async ({
  page,
  book,
  esi,
}) => {
  const sent = 0.6 * DAY_TAX;
  const s = overlapScenario({
    journal: [
      donationSent({
        refId: 960_101,
        to: CORP,
        amount: sent,
        back: 1,
        at: justNow(30),
        reason: minerPaymentCode(PILOT_MINER_ID),
      }),
    ],
  });
  await openMixed(page, s, book, esi);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.bookOwes - sent));
  await expect(cardOf(page, ROOK.name)).toContainText(isk(s.rookOwes));

  await settleUpOf(page, ROOK.name).click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${ROOK.name}` });
  await expect(dialog).toContainText(`Amount${isk(s.rookOwes)} ISK`);
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.bookOwes - sent));
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => ({ payeeId: l.payeeId, amount: l.amount }))).toEqual([
    { payeeId: ROOK_PAYEE_ID, amount: s.rookOwes },
  ]);
});

test("the officer's Miner page shows only what the book bills, never the pilot's own Payees", async ({
  page,
  book,
  esi,
}) => {
  const s = overlapScenario();
  await book.seed(s.docs);
  esi(s.esi[0]!);
  await openMiner(page, s.minerId, PILOT.name);
  const main = page.getByRole('main');
  await expect(main).toContainText(`Owed${isk(s.bookOwes)}`);
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true });
  const charges = ledger.getByRole('row', { name: /Mined at/ });
  await expect(charges).toHaveCount(s.bookDays);
  await expect(charges.filter({ hasText: isk(0.6 * DAY_TAX) })).toHaveCount(s.bookDays);
  await expect(main).not.toContainText(ROOK.name);
  await expect(main).not.toContainText(/Conflict|Unattributed/i);
  await expect(page.getByRole('heading', { name: /^Needs you/ })).toHaveCount(0);
});

test("the officer's Miner ledger marks where history locks, once, above the old day", async ({
  page,
  book,
  esi,
}) => {
  const s = overlapScenario({ locked: true });
  await book.seed(s.docs);
  esi(s.esi[0]!);
  await openMiner(page, s.minerId, PILOT.name);
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true });
  await expect(
    ledger.getByText(/^Locked before \d+ \w+ · fix with a correction dated/)
  ).toHaveCount(1);
  await expect(minerFact(page, 'Oldest unpaid')).toContainText(/\w+/);
  const rows = ledger.getByRole('row');
  const texts = await rows.allInnerTexts();
  const at = texts.findIndex((t) => /Locked before/.test(t));
  expect(at).toBeGreaterThan(0);
  expect(texts.slice(0, at).join('\n')).toContain(day(6));
  expect(texts.slice(at + 1).join('\n')).toContain(day(100));
});

function twoPayeeWallet() {
  const s = twoPayeesScenario();
  const journal = [
    donationSent({ refId: s.cinderRefId, to: CINDER.id, amount: DAY_TAX, back: 2 }),
    donationSent({
      refId: s.corpRefId,
      to: CORP,
      amount: DAY_TAX,
      back: 1,
      at: justNow(30),
      reason: minerPaymentCode(PILOT_MINER_ID),
    }),
  ];
  return { s, scenario: { docs: s.docs, personal: s.personal, esi: s.esi(journal) } };
}

test('a book and a corporation with no book are each paid oldest first, from their own money', async ({
  page,
  book,
  esi,
}) => {
  const { s, scenario } = twoPayeeWallet();
  await openMixed(page, scenario, book, esi);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.owed - DAY_TAX));
  await expect(cardOf(page, CINDER.name)).toContainText(isk(s.owed));
  await expect(page.getByRole('region', { name: 'You owe' })).toContainText(/isn't linked yet/);

  await ledgerButton(page, CORP_NAME).click();
  const corp = ledgerOf(page, CORP_NAME);
  await expect(corp).toContainText(new RegExp(`Days owed\\s*${s.bookDays.length - 1}`));
  await expect(corp.getByRole('row', { name: /Mined at E2E Athanor Alpha/ })).toHaveCount(3);
  await expect(corp.getByRole('row', { name: /Payment/ })).toContainText(isk(DAY_TAX));
  await expect(corp.getByRole('row', { name: /Mined at Jita/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await ledgerButton(page, CINDER.name).click();
  const cinder = ledgerOf(page, CINDER.name);
  await expect(cinder).toContainText(new RegExp(`Days owed\\s*3`));
  await expect(cinder.getByRole('row', { name: /Mined at Jita/ })).toHaveCount(3);
  await expect(cinder.getByRole('row', { name: /Payment/ })).toHaveCount(0);
  await expect(cinder.getByRole('row', { name: /Athanor/ })).toHaveCount(0);
});

test('a wallet payment to a corporation with no book is suggested for that Payee alone, and links to it only', async ({
  page,
  book,
  esi,
}) => {
  const { s, scenario } = twoPayeeWallet();
  await openMixed(page, scenario, book, esi);
  await page
    .getByRole('region', { name: 'You owe' })
    .getByRole('button', { name: 'Link payment', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Link a payment you already made' });
  await expect(dialog).toContainText(`${CINDER.name}`);
  const payments = dialog.getByRole('radio');
  await expect(payments).toHaveCount(1);
  await expect(dialog).toContainText(`${isk(DAY_TAX)} ISK`);
  await payments.check();
  await dialog.getByRole('button', { name: /^Link to / }).click();
  await expect(dialog).toBeHidden();

  await expect(cardOf(page, CINDER.name)).toContainText(isk(s.owed - DAY_TAX));
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.owed - DAY_TAX));
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => ({ id: l.id, payeeId: l.payeeId, amount: l.amount }))).toEqual([
    { id: `journal:${s.cinderRefId}`, payeeId: CINDER_PAYEE_ID, amount: DAY_TAX },
  ]);
});

test("Settle up for the corporation with no book records a link to it, and the book's payment code is not on it", async ({
  page,
  book,
  esi,
}) => {
  const s = twoPayeesScenario();
  await openMixed(page, { docs: s.docs, personal: s.personal, esi: s.esi() }, book, esi);
  await settleUpOf(page, CINDER.name).click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${CINDER.name}` });
  await expect(dialog).toContainText(`Amount${isk(s.owed)} ISK`);
  await expect(dialog).not.toContainText(minerPaymentCode(PILOT_MINER_ID));
  await dialog.getByRole('button', { name: 'Record payment' }).click();
  await expect(dialog).toBeHidden();
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.owed));
  const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
  expect(links.map((l) => ({ payeeId: l.payeeId, amount: l.amount }))).toEqual([
    { payeeId: CINDER_PAYEE_ID, amount: s.owed },
  ]);
});

test("a pilot in two books reads each book's figures, ledger and payment code apart", async ({
  page,
  book,
  esi,
}) => {
  const s = twoBooksScenario();
  await openMixed(page, { docs: s.docs, alt: s.alt, esi: s.esi() }, book, esi);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.ownerOwes));
  await expect(cardOf(page, 'Other Corp')).toContainText(isk(s.altOwes));
  await expect(page.getByRole('region', { name: 'You owe' })).toContainText(
    `${isk(s.ownerOwes + s.altOwes)} ISK`
  );

  await ledgerButton(page, CORP_NAME).click();
  const corp = ledgerOf(page, CORP_NAME);
  await expect(corp.getByRole('row', { name: /Mined at E2E Athanor Alpha/ })).toHaveCount(3);
  await expect(corp.getByRole('row', { name: /Tatara Beta/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await ledgerButton(page, 'Other Corp').click();
  const other = ledgerOf(page, 'Other Corp');
  await expect(other.getByRole('row', { name: /Mined at E2E Tatara Beta/ })).toHaveCount(2);
  await expect(other.getByRole('row', { name: /Athanor/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const cases = [
    { name: CORP_NAME, owed: s.ownerOwes, code: minerPaymentCode(s.ownerMinerId) },
    { name: 'Other Corp', owed: s.altOwes, code: minerPaymentCode(s.altMinerId) },
  ];
  for (const c of cases) {
    await settleUpOf(page, c.name).click();
    const dialog = page.getByRole('dialog', { name: `Settle up — ${c.name}` });
    await expect(dialog).toContainText(`Amount${isk(c.owed)} ISK`);
    await expect(dialog).toContainText(`Reason${c.code}`);
    await expect(dialog.getByRole('button', { name: 'Record payment' })).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  expect(minerPaymentCode(s.ownerMinerId)).not.toBe(minerPaymentCode(s.altMinerId));
});

test('a character a book grouped but the pilot has not added is named once per corporation', async ({
  page,
  book,
  esi,
}) => {
  const s = twoBooksScenario();
  await openMixed(page, { docs: s.docs, alt: s.alt, esi: s.esi() }, book, esi);
  await page.getByRole('button', { name: /needs? attention/ }).click();
  const warning = (corp: string, who: string) =>
    page.getByText(`${corp} counts ${who} as yours.`, { exact: false });
  await expect(warning(CORP_NAME, 'Test Pilot Hauler').first()).toBeVisible();
  await expect(warning('Other Corp', MINER.cora.name).first()).toBeVisible();
  await page.getByRole('button', { name: `Not yours? Tell ${CORP_NAME}` }).click();
  await expect(warning(CORP_NAME, 'Test Pilot Hauler')).toHaveCount(0);
  await expect(warning('Other Corp', MINER.cora.name).first()).toBeVisible();
});

test("the officer's Miner page shows only that book's days, not the pilot's other corporation's", async ({
  page,
  book,
  esi,
}) => {
  const s = twoBooksScenario();
  await book.seed(s.docs);
  for (const answer of s.esi()) esi(answer);
  await openMiner(page, s.ownerMinerId, PILOT.name);
  const main = page.getByRole('main');
  await expect(main).toContainText(`Owed${isk(s.ownerOwes)}`);
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true });
  await expect(ledger.getByRole('row', { name: /Mined at/ })).toHaveCount(3);
  await expect(main).not.toContainText(ALT_B.name);
  await expect(main).not.toContainText(/Tatara|Other Corp/);
});

test("a corporation's new book is its one card; the pilot's older personal history stays, read-only", async ({
  page,
  book,
  esi,
}) => {
  const s = historyMovesOverScenario();
  await openMixed(page, { docs: s.docs, personal: s.personal, esi: s.esi }, book, esi);
  const bookOwes = s.bookDays.length * DAY_TAX;
  const cards = cardOf(page, CORP_NAME);
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(isk(bookOwes));
  await expect(page.getByText('Corp Tax Book', { exact: true })).toHaveCount(1);

  await ledgerButton(page, CORP_NAME).click();
  const billed = ledgerOf(page, CORP_NAME);
  await expect(billed.getByRole('row', { name: /Mined at E2E Athanor Alpha/ })).toHaveCount(3);
  await expect(billed.getByRole('row', { name: /Payment/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Payees', exact: true }).click();
  const manage = page.getByRole('dialog', { name: 'Manage Payees' });
  await expect(manage).toContainText(`Tracked by ${CORP_NAME}'s Corp Tax Book now`);
  await expect(manage.getByRole('button', { name: /^Archive/ })).toHaveCount(0);
  await manage.getByRole('button', { name: 'Old history' }).click();
  const own = ledgerOf(page, CORP_NAME);
  await expect(own.getByRole('row', { name: /Payment/ })).toContainText(isk(DAY_TAX));
  await expect(own.getByRole('row', { name: /Mined/ })).toHaveCount(s.preDays.length);
  await expect(own.getByRole('columnheader', { name: 'Balance' })).toHaveCount(0);
  await expect(own).not.toContainText(/Owes|Paid through| ISK credit/);
});

test('This character and All characters each show the rows of the books they cover', async ({
  page,
  book,
  esi,
}) => {
  const s = twoBooksScenario();
  await openMixed(page, { docs: s.docs, alt: s.alt, esi: s.esi() }, book, esi);
  await expect(openRows(page)).toHaveCount(5);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.ownerOwes));
  await expect(cardOf(page, 'Other Corp')).toContainText(isk(s.altOwes));

  await page
    .getByRole('button', { name: /^All characters/ })
    .first()
    .click();
  await page.getByRole('menuitemradio', { name: 'This character' }).click();
  await expect(page).toHaveURL(/tax\.character=current/);
  await expect(openRows(page)).toHaveCount(3);
  await expect(openRows(page).filter({ hasText: 'Other Corp' })).toHaveCount(0);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.ownerOwes));
  await expect(cardOf(page, 'Other Corp')).toHaveCount(0);
  await expect(page.getByText(/across \d+ payees/)).toHaveCount(0);

  await page
    .getByRole('button', { name: /^This character/ })
    .first()
    .click();
  await page.getByRole('menuitemradio', { name: 'All characters' }).click();
  await expect(openRows(page)).toHaveCount(5);
});

test("an alt's donation pays the group the alt is in, whichever corporation the main is in", async ({
  page,
  book,
  esi,
}) => {
  const s = twoBooksScenario();
  const sent = { refId: 971_001, amount: DAY_TAX, back: 1, at: justNow(30) };
  await openMixed(
    page,
    {
      docs: s.docs,
      alt: s.alt,
      esi: s.esi({
        alt: [
          donationSent({
            ...sent,
            from: ALT_B,
            to: OTHER_CORP,
            reason: minerPaymentCode(s.altMinerId),
          }),
        ],
      }),
    },
    book,
    esi
  );
  await expect(cardOf(page, 'Other Corp')).toContainText(isk(s.altOwes - DAY_TAX));
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.ownerOwes));

  await book.seed([
    creditedDonation({
      ...sent,
      corporationId: OTHER_CORP,
      characterId: ALT_B.id,
      minerId: s.altMinerId,
    }),
  ]);
  await page.reload();
  await expect(cardOf(page, 'Other Corp')).toContainText(isk(s.altOwes - DAY_TAX));
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.ownerOwes));
});

test("an alt in another corporation that mines the main's moons is billed in the main's book, and its donation pays that group", async ({
  page,
  book,
  esi,
}) => {
  const s = guestAltScenario();
  const sent = { refId: 971_002, amount: DAY_TAX, back: 2 };
  await book.seed([creditedDonation({ ...sent, characterId: ALT_B.id, minerId: s.minerId })]);
  await openMixed(page, { docs: s.docs, alt: s.alt, esi: s.esi() }, book, esi);
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.groupOwes - DAY_TAX));
  await expect(cardOf(page, 'Other Corp')).toContainText(isk(s.altOwes));
  await ledgerButton(page, CORP_NAME).click();
  const corp = ledgerOf(page, CORP_NAME);
  await expect(corp.getByRole('row', { name: /Mined at E2E Athanor Alpha/ })).toHaveCount(4);
  await expect(corp.getByRole('row', { name: /Payment/ })).toContainText(isk(DAY_TAX));
  await expect(corp.getByRole('row', { name: /Tatara/ })).toHaveCount(0);
});

test('a pilot who left the corporation still sees what its book lists, the late notice, and can pay', async ({
  page,
  book,
  esi,
}) => {
  const s = leaverScenario();
  await book.seed(s.docs);
  for (const answer of s.esi) esi(answer);
  esi((path, route) => {
    if (path === '/characters/affiliation') {
      const ids = route.request().postDataJSON() as number[];
      return ids.map((id) => ({
        character_id: id,
        corporation_id: id === PILOT.id ? OUTSIDE_CORP : corpOf(id),
      }));
    }
    if (path === `/characters/${PILOT.id}`)
      return { name: PILOT.name, corporation_id: OUTSIDE_CORP };
    return undefined;
  });
  await signInAsOfficer(page, './mining/tax');
  await page.evaluate(
    async (remembered) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('neocom');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ key: 'corpTaxBookCorps', value: remembered });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
    },
    { [PILOT.id]: [CORP] }
  );
  await page.reload();

  await expect(page.getByText(`You left ${CORP_NAME}`)).toBeVisible();
  await expect(page.getByText(/nothing new is added/)).toContainText(isk(s.owed));
  await expect(cardOf(page, CORP_NAME)).toContainText(isk(s.owed));
  await page.getByRole('button', { name: /needs? attention/ }).click();
  await expect(page.getByText(/Late notice .*not paid yet/)).toBeVisible();
  await page.getByRole('button', { name: `Pay ${isk(s.owed)} ISK` }).click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${CORP_NAME}` });
  await expect(dialog).toContainText(`Amount${isk(s.owed)} ISK`);
  await expect(dialog).toContainText(`Reason${minerPaymentCode(PILOT_MINER_ID)}`);
});

test("closing a guest's account keeps what they owe payable, and money for it waits for an officer", async ({
  page,
  book,
}) => {
  const seed = new BookSeed({ startBack: 40 }).mine(MINER.guest.id, [9, 8, 4, 3]);
  await book.seed(seed.docs());
  await signInAsOfficer(page, minerUrl(solo(MINER.guest.id)));
  await expect(page.getByRole('heading', { level: 1, name: MINER.guest.name })).toBeVisible();
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Close account' }).click();
  const dialog = page.getByRole('dialog', { name: `Close ${MINER.guest.name}'s account?` });
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('Fleet ended');
  await dialog.getByRole('button', { name: 'Close account' }).click();
  await expect(dialog).toBeHidden();

  const main = page.getByRole('main');
  await expect(main).toContainText(/Account closed on/);
  await expect(main).toContainText(`Owed${isk(4 * DAY_TAX)}`);
  await expect(
    page
      .getByRole('table', { name: 'Ledger', exact: true })
      .getByRole('row', { name: /Final notice/ })
  ).toBeVisible();

  let token = '';
  await expect
    .poll(async () => {
      const notices = await readCollection(`corps/${CORP}/lateNotices`);
      const [id] = [...notices].find(([, n]) => n.kind === 'final') ?? [];
      token = id ? String((await readDoc(`corps/${CORP}/lateNoticeLinks/${id}`))?.token ?? '') : '';
      return token;
    })
    .not.toBe('');
  await page.goto(`./corp-tax-book/verify/${token}`);
  const verify = page.getByRole('main');
  await expect(verify).toContainText('This account is closed');
  await expect(verify).toContainText(`${isk(4 * DAY_TAX)} ISK`);
  await expect(verify).toContainText(`Reason${minerPaymentCode(solo(MINER.guest.id))}`);

  await book.seed([
    {
      path: `corps/${CORP}/payments/j1_920001`,
      data: {
        id: 'j1_920001',
        source: 'donation',
        characterId: MINER.guest.id,
        uid: `char:${MINER.guest.id}`,
        amount: DAY_TAX,
        at: `${day(0)}T10:00:00.000Z`,
        division: 1,
        reviewReason: 'account-closed',
      },
    },
  ]);
  await page.goto(minerUrl(solo(MINER.guest.id)));
  await expect(page.getByRole('heading', { level: 1, name: MINER.guest.name })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(`Owed${isk(4 * DAY_TAX)}`);
  await expect(minerFact(page, 'Paid')).toHaveText('—');
  await page.goto('./corp/moons');
  await expect(
    page.getByText(
      `${MINER.guest.name}'s Miner account is closed, so the book did not credit it.`,
      {
        exact: false,
      }
    )
  ).toBeVisible();
});
