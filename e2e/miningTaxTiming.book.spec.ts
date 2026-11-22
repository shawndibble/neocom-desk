/**
 * Timing and pricing when a pilot and their corporation both track mining tax (decision
 * 20261120-235011, "every Payee is paid oldest first", and 20261121-231334): money that reaches
 * the pilot's wallet, the book or an officer's hand first; a day the pilot paid on an estimate that
 * the book prices at its close; credit ahead of any billed day; a Miner an officer will not forgive.
 * Each from the pilot's side (the Tax tab) and the officer's (the Miners list and the Miner's
 * page). The pilot is the suite's one signed-in Character, an officer of the book as well, so one
 * browser reads both.
 *
 * The book is read from the Firebase emulators (the `*.book.spec.ts` set). A sync of the book is
 * not run: what it would store is written into the emulator at the moment a test says it ran. The
 * scenarios and the figures they follow from are `support/taxBook/timingScenarios.ts`.
 */
import type { Page } from '@playwright/test';
import {
  expect,
  minerUrl,
  signInAsOfficer,
  test,
  type Book,
  type EsiOverride,
} from './support/taxBook/bookTest';
import {
  BookSeed,
  DAY_TAX,
  day,
  isk,
  minerPaymentCode,
  noonOf,
  shortDay,
} from './support/taxBook/bookSeed';
import { readCollection, readDoc } from './support/taxBook/emulator';
import { CORP, MINER, OFFICER } from './support/taxBook/identities';
import { lockDateFor } from '../functions/src/corpTaxBookCheckpoint';
import {
  PERSONAL_SYSTEM,
  PILOT,
  PILOT_MINER_ID,
  creditedDonation,
  donationSent,
  miningLedger,
  pilotEsi,
} from './support/taxBook/memberSeed';
import { ROOK, payeeRecord, readStore } from './support/taxBook/personalSeed';
import { openMixed } from './support/taxBook/mixedScenarios';
import type { MiningTaxAssignmentRecord, MiningTaxPaymentLinkRecord } from '../src/db/records';
import { installDayPrices } from './support/taxBook/prices';
import {
  CLOSES,
  ESTIMATE,
  NEXT_DAY,
  SAME_DAY,
  justNow,
  pilotBook,
  taxAt,
  type CloseKind,
} from './support/taxBook/timingScenarios';

const CORP_NAME = 'Test Corp';
const CODE = minerPaymentCode(PILOT_MINER_ID);

const ledgerButton = (page: Page, name = CORP_NAME) =>
  page.getByRole('button', { name: `Open the ledger of ${name}` });
const pilotLedger = (page: Page) => page.getByRole('dialog', { name: CORP_NAME });
const officerLedger = (page: Page) => page.getByRole('table', { name: 'Ledger', exact: true });
const officerRow = (page: Page, name: RegExp) => officerLedger(page).getByRole('row', { name });
const minersRow = (page: Page, name: string) =>
  page.getByRole('table', { name: 'Miners' }).getByRole('row', { name: new RegExp(name) });
const owed = (page: Page, amount: number) =>
  expect(page.getByRole('main')).toContainText(`Owed${isk(amount)}`);
const owedDaysHeading = (page: Page, count: number) =>
  expect(page.getByRole('heading', { name: `Owed days · ${count}` })).toBeVisible();

type Journal = Parameters<typeof pilotEsi>[0]['journal'];

/**
 * Seeds the book, answers the pilot's ESI and opens the pilot's Tax tab. `prices` moves the close
 * price of some days (`installDayPrices`), by days back.
 */
async function openPilot(
  page: Page,
  book: Book,
  esi: (answer: EsiOverride) => void,
  s: {
    seed: BookSeed;
    mined: readonly number[];
    journal?: Journal;
    extra?: Parameters<Book['seed']>[0];
    prices?: Record<number, number>;
  }
) {
  await book.seed([...s.seed.docs(), ...(s.extra ?? [])]);
  if (s.prices) await installDayPrices(page, s.prices);
  esi(pilotEsi({ mining: miningLedger(s.mined), journal: s.journal ?? [] }));
  await signInAsOfficer(page, './mining/tax');
}

/** The officer's view of the pilot's Miner: its page, read once the book and the names are in. */
async function gotoMiner(page: Page) {
  // A page still settling its own URL aborts a navigation started over it: try once more.
  await page.goto(minerUrl(PILOT_MINER_ID)).catch(() => page.goto(minerUrl(PILOT_MINER_ID)));
  await expect(officerLedger(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: PILOT.name })).toBeVisible();
}

/** A donation the pilot sent the corporation with the Miner's code. */
const sentDonation = (p: { refId: number; amount: number; back: number; at?: string }) =>
  donationSent({ ...p, to: CORP, reason: CODE });
/** The same donation as the book stores it once a sync has read it. */
const credited = (p: { refId: number; amount: number; back: number; at?: string }) =>
  creditedDonation({ ...p, characterId: PILOT.id });

// ---------------------------------------------------------------------------------------------
// 1. The pilot pays first; the book catches up later
// ---------------------------------------------------------------------------------------------

test('pilot side: a donation just sent counts at once, and is not counted again once the book credits it', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_101, amount: DAY_TAX, back: 1 };
  await openPilot(page, book, esi, {
    seed: pilotBook([6, 5, 4]),
    mined: [6, 5, 4],
    journal: [sentDonation(sent)],
  });
  // The book holds nothing yet, and the money already pays the oldest day on the pilot's account.
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await expect(pilotLedger(page)).toContainText(
    new RegExp(`Days owed\\s*2[\\s\\S]*Oldest unpaid${day(5)}`)
  );
  await page.keyboard.press('Escape');

  // The book's sync stores the same transfer: it is now credited, and still counted once.
  await book.seed([credited(sent)]);
  await page.reload();
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'You owe' })).toContainText(
    `${isk(2 * DAY_TAX)}ISK`
  );
});

test('officer side: nothing before the sync; after it the donation is on the right Miner and pays the oldest days', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_102, amount: DAY_TAX, back: 1 };
  // Another Miner who mined the same days, whose account the pilot's donation must not touch.
  const seed = pilotBook([6, 5, 4]).mine(MINER.ada.id, [6, 5]);
  await book.seed(seed.docs());
  esi(pilotEsi({ mining: miningLedger([6, 5, 4]), journal: [sentDonation(sent)] }));
  await signInAsOfficer(page, './corp/moons/miners');
  const pilot = () => minersRow(page, PILOT.name);
  const ada = () => minersRow(page, MINER.ada.name);
  await expect(pilot()).toContainText(`Owes ${isk(3 * DAY_TAX)} (3 days, oldest ${shortDay(6)})`);
  await expect(ada()).toContainText(`Owes ${isk(2 * DAY_TAX)} (2 days, oldest ${shortDay(6)})`);

  await book.seed([credited(sent)]);
  await page.reload();
  await expect(pilot()).toContainText(`Owes ${isk(2 * DAY_TAX)} (2 days, oldest ${shortDay(5)})`);
  await expect(ada()).toContainText(`Owes ${isk(2 * DAY_TAX)} (2 days, oldest ${shortDay(6)})`);
  await pilot().click();
  await expect(page.getByRole('heading', { level: 1, name: PILOT.name })).toBeVisible();
  await owed(page, 2 * DAY_TAX);
  await officerRow(page, /Payment from Test Pilot/).click();
  await expect(officerLedger(page)).toContainText(`Days it paid${day(6)}`);
});

test('Settle up for the book records nothing on the device: the money counts only once it arrives', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_103, amount: DAY_TAX, back: 0, at: justNow() };
  await openPilot(page, book, esi, { seed: pilotBook([6, 5, 4]), mined: [6, 5, 4] });
  await expect(ledgerButton(page)).toContainText(isk(3 * DAY_TAX));
  await ledgerButton(page)
    .locator('xpath=following::button[normalize-space()="Settle up"][1]')
    .click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${CORP_NAME}` });
  await expect(dialog).toContainText(`Amount${isk(3 * DAY_TAX)} ISK`);
  await expect(dialog).toContainText(`Reason${CODE}`);
  await expect(dialog.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Nothing was written: the pilot has not paid, so nothing is counted as paid.
  expect(await readStore(page, 'miningTaxPaymentLinks')).toEqual([]);
  expect(await readStore(page, 'miningTaxAssignments')).toEqual([]);
  await expect(ledgerButton(page)).toContainText(isk(3 * DAY_TAX));

  // The pilot sends it in the game, and the book's sync reads it: now it pays the oldest day.
  await book.seed([credited(sent)]);
  await page.reload();
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  expect(await readStore(page, 'miningTaxPaymentLinks')).toEqual([]);
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
});

// ---------------------------------------------------------------------------------------------
// 2. The corporation records first; the pilot's wallet catches up
// ---------------------------------------------------------------------------------------------

test('officer side: a hand-recorded payment is not counted again when the sync brings the donation', async ({
  page,
  book,
  esi,
}) => {
  await book.seed(pilotBook([6, 5, 4]).docs());
  esi(pilotEsi({ mining: miningLedger([6, 5, 4]) }));
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await expect(officerLedger(page)).toBeVisible();
  await owed(page, 3 * DAY_TAX);
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: /Record a payment for/ });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX));
  await dialog.getByRole('button', { name: `Record ${isk(DAY_TAX)}` }).click();
  await expect(dialog).toBeHidden();
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);

  // The pilot's donation of the same amount reaches the corporation's wallet. The sync finds the
  // officer's record for it (`linkHandRecord`): the record stands for it, no second payment is stored.
  const payments = await readCollection(`corps/${CORP}/payments`);
  const [[id, hand]] = [...payments];
  expect(payments.size).toBe(1);
  expect(hand!.source).toBe('manual');
  await book.seed([
    { path: `corps/${CORP}/payments/${id}`, data: { ...hand!, transferId: 'j1_970201' } },
  ]);
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);
  await expect(page.getByRole('main')).toContainText(`Paid${isk(DAY_TAX)}`);
});

test("pilot side: an officer's hand record, the wallet entry and the synced donation are one payment", async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_202, amount: DAY_TAX, back: 1 };
  const hand = {
    id: 'm-hand-1',
    source: 'manual',
    minerId: PILOT_MINER_ID,
    characterId: PILOT.id,
    uid: `char:${PILOT.id}`,
    amount: DAY_TAX,
    // An officer dates it by the day: noon of it, not the wallet's own minute.
    at: noonOf(1),
    recordedBy: OFFICER.id,
  };
  const seed = pilotBook([6, 5, 4]).raw('payments', hand.id, hand);
  // The wallet shows the transfer an hour off the officer's stamp: the record and the entry are
  // one transfer (within two days either way).
  const journal = [sentDonation({ ...sent, at: `${day(1)}T13:05:00.000Z` })];
  await openPilot(page, book, esi, { seed, mined: [6, 5, 4], journal });
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  // The book already holds the money, so there is nothing to link it to.
  await expect(page.getByText('Payments to link')).toHaveCount(0);
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // The sync reads the donation and links the hand record to it: still one payment.
  await book.seed([
    { path: `corps/${CORP}/payments/${hand.id}`, data: { ...hand, transferId: 'j1_970202' } },
  ]);
  await page.reload();
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  await expect(page.getByText('Payments to link')).toHaveCount(0);
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);
});

// ---------------------------------------------------------------------------------------------
// 3. The pilot pays a day straight away; the book prices it at its close
// ---------------------------------------------------------------------------------------------

test("a day mined today owes nothing yet: the pilot's payment is credit, on both sides", async ({
  page,
  book,
  esi,
}) => {
  const at = justNow();
  const sent = { refId: 970_301, amount: ESTIMATE, back: 0, at };
  await openPilot(page, book, esi, {
    seed: pilotBook([0]),
    mined: [0],
    journal: [sentDonation(sent)],
  });
  // The pilot's side, with the transfer still only in their wallet: paid ahead, nothing owed.
  await expect(ledgerButton(page)).toContainText(new RegExp(`${isk(ESTIMATE)}\\s*ISK credit`));
  await expect(page.getByRole('main')).not.toContainText(/You owe|Owes/);
  const today = page.getByRole('row').filter({ hasText: day(0) });
  await expect(today).toContainText(/pending corp record/i);
  await expect(today).not.toContainText(/billed|outstanding/i);
  await expect(page.getByText(/is closed \(/)).toBeVisible();

  // The book has read it: the same on the officer's page. The day is Today's mining, not billed.
  await book.seed([credited(sent)]);
  await gotoMiner(page);
  await expect(page.getByRole('main')).toContainText(`Credit${isk(ESTIMATE)}`);
  await expect(page.getByRole('main')).toContainText(`Today's mining${isk(ESTIMATE)}`);
  await expect(page.getByRole('main')).not.toContainText('Owed days · 1');
  await owedDaysHeading(page, 0);
});

const SAME_DAY_CASES: readonly {
  kind: CloseKind;
  title: string;
}[] = [
  {
    kind: 'slightlyLower',
    title: 'a close a little lower: the day is paid and the over-payment is credit',
  },
  {
    kind: 'slightlyHigher',
    title: 'a close a little higher: the day reads paid and the small gap is forgiven',
  },
  { kind: 'clearlyHigher', title: 'a close clearly higher: the remainder is owed on that day' },
  {
    kind: 'clearlyLower',
    title: 'a close clearly lower: the extra is credit and pays the next day billed',
  },
];

for (const { kind, title } of SAME_DAY_CASES) {
  test(`same-day payment, ${title}`, async ({ page, book, esi }) => {
    const price = CLOSES[kind].price;
    const tax = taxAt(price);
    const mined = kind === 'clearlyLower' ? [SAME_DAY, NEXT_DAY] : [SAME_DAY];
    // Paid on the day, at the figure the Tax tab showed, before the close.
    const sent = { refId: 970_310, amount: ESTIMATE, back: SAME_DAY };
    await openPilot(page, book, esi, {
      seed: pilotBook(mined),
      mined,
      extra: [credited(sent)],
      journal: [sentDonation(sent)],
      prices: { [SAME_DAY]: price },
    });
    const gap = tax - ESTIMATE;
    const tolerance = tax * 0.005;
    const dayRow = () => page.getByRole('row').filter({ hasText: day(SAME_DAY) });

    if (kind === 'slightlyLower') {
      expect(gap).toBeLessThan(0);
      // 4,000 over: credit, nothing owed.
      await expect(ledgerButton(page)).toContainText(new RegExp(`${isk(-gap)}\\s*ISK credit`));
      await ledgerButton(page).click();
      await expect(pilotLedger(page)).toContainText(`Mined at E2E Athanor Alpha\u2212${isk(tax)}`);
      await expect(pilotLedger(page)).toContainText(isk(-gap));
      await page.keyboard.press('Escape');
      await gotoMiner(page);
      await expect(page.getByRole('main')).toContainText(`Credit${isk(-gap)}`);
      await owedDaysHeading(page, 0);
    } else if (kind === 'slightlyHigher') {
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThanOrEqual(tolerance);
      // Short 4,000, inside the tolerance: paid, nothing owed, no card to open.
      await expect(page.getByRole('row').filter({ hasText: day(SAME_DAY) })).toContainText(/paid/i);
      await expect(ledgerButton(page)).toHaveCount(0);
      await expect(page.getByRole('main')).not.toContainText(/You owe|Owes/);
      // The pilot reads the forgiven gap too: the paid day's detail opens the book's ledger.
      await dayRow().click();
      await page.getByRole('button', { name: `Open ${CORP_NAME} ledger` }).click();
      await expect(pilotLedger(page)).toContainText(/Shortfall forgiven/);
      await expect(pilotLedger(page)).toContainText(isk(gap));
      await page.keyboard.press('Escape');
      await gotoMiner(page);
      await expect(officerRow(page, /Shortfall forgiven/)).toContainText(isk(gap));
      await owedDaysHeading(page, 0);
      await expect(page.getByRole('main')).toContainText(
        `Oldest unpaidPaid through ${shortDay(SAME_DAY)}`
      );
    } else if (kind === 'clearlyHigher') {
      expect(gap).toBeGreaterThan(tolerance);
      // Short 10,000: the day stays owed for that much, on both sides.
      await expect(ledgerButton(page)).toContainText(isk(gap));
      await ledgerButton(page).click();
      await expect(pilotLedger(page)).toContainText(
        new RegExp(`Days owed\\s*1[\\s\\S]*Oldest unpaid${day(SAME_DAY)}`)
      );
      await page.keyboard.press('Escape');
      await expect(dayRow()).not.toContainText(/paid/i);
      await gotoMiner(page);
      await owed(page, gap);
      await owedDaysHeading(page, 1);
      await expect(officerRow(page, /Shortfall forgiven/)).toHaveCount(0);
    } else {
      expect(-gap).toBeGreaterThan(0);
      // 20,000 over: the day is paid and the extra pays into the next day billed.
      await expect(ledgerButton(page)).toContainText(isk(DAY_TAX + gap));
      await ledgerButton(page).click();
      await expect(pilotLedger(page)).toContainText(
        new RegExp(`Days owed\\s*1[\\s\\S]*Oldest unpaid${day(NEXT_DAY)}`)
      );
      await page.keyboard.press('Escape');
      await gotoMiner(page);
      await owed(page, DAY_TAX + gap);
      await officerRow(page, /Payment from Test Pilot/).click();
      await expect(officerLedger(page)).toContainText(
        `Days it paid${day(SAME_DAY)}${isk(tax)} ISK${day(NEXT_DAY)}${isk(-gap)} ISK`
      );
    }
  });
}

// ---------------------------------------------------------------------------------------------
// 4. A personal Payee with no book: the stored figure is never repriced to the close
// ---------------------------------------------------------------------------------------------

for (const close of [
  { word: 'higher', price: CLOSES.clearlyHigher.price },
  { word: 'lower', price: CLOSES.clearlyLower.price },
] as const) {
  test(`a personal Payee's day keeps the figure it was assigned at, a close ${close.word} later`, async ({
    page,
    book,
    esi,
  }) => {
    const payeeId = 'p-rook-default';
    // Rook is the pilot's Default System Payee for the system they mined in today: the ore is
    // given to Rook as the Tax tab first reads it, valued at the prices of that moment.
    const scenario = {
      docs: [],
      esi: [pilotEsi({ mining: miningLedger([0], PERSONAL_SYSTEM), journal: [] })],
      personal: {
        payees: [
          payeeRecord({
            id: payeeId,
            characterId: PILOT.id,
            name: ROOK.name,
            entityId: ROOK.id,
            defaultSystemId: PERSONAL_SYSTEM,
          }),
        ],
      },
    };
    await openMixed(page, scenario, book, esi);
    await expect(ledgerButton(page, ROOK.name)).toContainText(isk(ESTIMATE));
    const stored = () => readStore<MiningTaxAssignmentRecord>(page, 'miningTaxAssignments');
    expect((await stored()).map((a) => [a.date, a.taxOwed, a.estimatedValue])).toEqual([
      [day(0), ESTIMATE, 10 * ESTIMATE],
    ]);

    // The day closes at another price, and the tab loads again: the Assignment is not priced anew
    // (only an Ore Form change reprices an Outstanding one), so the pilot owes what they were shown.
    await installDayPrices(page, { 0: close.price });
    await page.reload();
    await expect(ledgerButton(page, ROOK.name)).toContainText(isk(ESTIMATE));
    expect((await stored()).map((a) => [a.taxOwed, a.estimatedValue])).toEqual([
      [ESTIMATE, 10 * ESTIMATE],
    ]);

    // Paying that figure pays the day: no remainder, no credit, whatever the close was.
    await ledgerButton(page, ROOK.name)
      .locator('xpath=following::button[normalize-space()="Settle up"][1]')
      .click();
    const dialog = page.getByRole('dialog', { name: `Settle up — ${ROOK.name}` });
    await expect(dialog).toContainText(`Amount${isk(ESTIMATE)} ISK`);
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(dialog).toBeHidden();
    await expect(ledgerButton(page, ROOK.name)).toHaveCount(0);
    const links = await readStore<MiningTaxPaymentLinkRecord>(page, 'miningTaxPaymentLinks');
    expect(links.map((l) => l.amount)).toEqual([ESTIMATE]);
    await expect(page.getByRole('row').filter({ hasText: day(0) })).toContainText(/paid/i);
  });
}

// ---------------------------------------------------------------------------------------------
// 5. A payment ahead of the first billed day, or from before the book began
// ---------------------------------------------------------------------------------------------

test('a payment from before any mining is billed is held, then pays the first day billed', async ({
  page,
  book,
  esi,
}) => {
  // Sent the day before the pilot first mined: 1.5 days of tax, so the first day is paid in full
  // and the second in half. The pilot's wallet shows it too; the book holds the same transfer.
  const sent = { refId: 970_501, amount: 1.5 * DAY_TAX, back: SAME_DAY + 1 };
  await openPilot(page, book, esi, {
    seed: pilotBook([SAME_DAY, NEXT_DAY]),
    mined: [SAME_DAY, NEXT_DAY],
    extra: [credited(sent)],
    journal: [sentDonation(sent)],
  });
  await expect(ledgerButton(page)).toContainText(isk(0.5 * DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page)).toContainText(
    new RegExp(`Days owed\\s*1[\\s\\S]*Oldest unpaid${day(NEXT_DAY)}`)
  );
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await gotoMiner(page);
  await owed(page, 0.5 * DAY_TAX);
  await officerRow(page, /Payment from Test Pilot/).click();
  await expect(officerLedger(page)).toContainText(
    `Days it paid${day(SAME_DAY)}${isk(DAY_TAX)} ISK${day(NEXT_DAY)}${isk(0.5 * DAY_TAX)} ISK`
  );
});

test('a payment from before the book began credits nothing; one on its first day counts', async ({
  page,
  book,
  esi,
}) => {
  // The book started 40 days ago. A big donation from the day before it paid no mining the book
  // bills; one on the start date counts, on the pilot's account and the officer's alike.
  const before = { refId: 970_502, amount: 3 * DAY_TAX, back: 41 };
  const onStart = { refId: 970_503, amount: DAY_TAX, back: 40 };
  await openPilot(page, book, esi, {
    seed: pilotBook([6, 5, 4]),
    mined: [6, 5, 4],
    extra: [credited(before), credited(onStart)],
    journal: [sentDonation(before), sentDonation(onStart)],
  });
  await expect(ledgerButton(page)).toContainText(isk(2 * DAY_TAX));
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(page.getByRole('main')).toContainText(`Paid${isk(DAY_TAX)}`);
});

// ---------------------------------------------------------------------------------------------
// 6. A Miner an officer will not forgive
// ---------------------------------------------------------------------------------------------

for (const exemption of [
  { forgive: 0, forgiven: 0, words: 'charged in full' },
  { forgive: 2_000, forgiven: 2_000, words: 'forgiven only up to 2,000' },
] as const) {
  test(`a payment short within the tolerance does not close the day when the shortfall is ${exemption.words}`, async ({
    page,
    book,
    esi,
  }) => {
    // 4,500 short of the day: inside the 5,000 the book would forgive. The officer's exemption for
    // the day (`setToleranceExemption`) says how much of it may be.
    const short = 4_500;
    const sent = { refId: 970_601, amount: DAY_TAX - short, back: SAME_DAY };
    const seed = pilotBook([SAME_DAY]).raw('toleranceExemptions', 'x-pilot-1', {
      id: 'x-pilot-1',
      minerId: PILOT_MINER_ID,
      date: day(SAME_DAY),
      forgive: exemption.forgive,
      reason: 'Short payments are charged for this Miner',
      by: OFFICER.id,
      at: new Date().toISOString(),
      uids: [`char:${PILOT.id}`],
    });
    await openPilot(page, book, esi, {
      seed,
      mined: [SAME_DAY],
      extra: [credited(sent)],
      journal: [sentDonation(sent)],
    });
    const left = short - exemption.forgiven;
    await expect(ledgerButton(page)).toContainText(isk(left));
    await ledgerButton(page).click();
    await expect(pilotLedger(page)).toContainText(
      new RegExp(`Days owed\\s*1[\\s\\S]*Oldest unpaid${day(SAME_DAY)}`)
    );
    await page.keyboard.press('Escape');
    await gotoMiner(page);
    await owed(page, left);
    await owedDaysHeading(page, 1);
    if (exemption.forgiven === 0) {
      await expect(officerRow(page, /Shortfall forgiven/)).toHaveCount(0);
    } else {
      await expect(officerRow(page, /Shortfall forgiven/)).toContainText(isk(exemption.forgiven));
    }
  });
}

test('an officer charges a forgiven shortfall: the Miner owes it again, on the pilot side too', async ({
  page,
  book,
  esi,
}) => {
  const short = 4_500;
  const sent = { refId: 970_602, amount: DAY_TAX - short, back: SAME_DAY };
  await book.seed([...pilotBook([SAME_DAY]).docs(), credited(sent)]);
  esi(pilotEsi({ mining: miningLedger([SAME_DAY]), journal: [sentDonation(sent)] }));
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await expect(officerLedger(page)).toBeVisible();
  await owedDaysHeading(page, 0);
  await expect(officerRow(page, /Shortfall forgiven/)).toContainText(isk(short));
  await page.getByRole('button', { name: /^More actions for .* Write-off$/ }).click();
  await page.getByRole('menuitem', { name: 'Charge this shortfall' }).click();
  const dialog = page.getByRole('dialog', { name: 'Charge this shortfall?' });
  await dialog.getByRole('textbox').fill('Short again this month');
  await dialog.getByRole('button', { name: 'Charge it' }).click();
  await expect(dialog).toBeHidden();
  await owed(page, short);

  await page.goto('./mining/tax').catch(() => page.goto('./mining/tax'));
  await expect(ledgerButton(page)).toContainText(isk(short));
});

// ---------------------------------------------------------------------------------------------
// 7. Edges of the same rules
// ---------------------------------------------------------------------------------------------

test('two equal donations sent minutes apart are two payments, though the book holds only one', async ({
  page,
  book,
  esi,
}) => {
  const first = { refId: 970_701, amount: DAY_TAX, back: 0, at: justNow(12) };
  const second = { refId: 970_702, amount: DAY_TAX, back: 0, at: justNow(8) };
  await openPilot(page, book, esi, {
    seed: pilotBook([6, 5, 4]),
    mined: [6, 5, 4],
    extra: [credited(first)],
    journal: [sentDonation(first), sentDonation(second)],
  });
  // The one the book holds is matched to one wallet entry only: the other is still in flight, and
  // counts. Both pay: one day owed. Never "the book holds an equal one, so this is it twice".
  await expect(ledgerButton(page)).toContainText(isk(DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(2);
  await page.keyboard.press('Escape');
  // The officer's book has the one payment until the next sync.
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);

  await book.seed([credited(second)]);
  await gotoMiner(page);
  await owed(page, DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(2);
  await page.goto('./mining/tax').catch(() => page.goto('./mining/tax'));
  await expect(ledgerButton(page)).toContainText(isk(DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(2);
});

test('a payment may be dated on the lock date and not the day before it', async ({
  page,
  book,
  esi,
}) => {
  const lock = lockDateFor(day(0));
  const dayBefore = new Date(Date.parse(`${lock}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  // A long book: the pilot mined a day before the lock date, and recently.
  await book.seed(
    new BookSeed({ startBack: 130 })
      .group(PILOT_MINER_ID, [PILOT.id])
      .mine(PILOT.id, [100, 5])
      .docs()
  );
  esi(pilotEsi({ mining: miningLedger([100, 5]) }));
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await expect(officerLedger(page)).toBeVisible();
  await page.getByRole('button', { name: 'Record payment' }).click();
  const dialog = page.getByRole('dialog', { name: /Record a payment for/ });
  await dialog.getByRole('textbox', { name: 'Amount' }).fill(String(DAY_TAX));
  const date = dialog.getByLabel('Date paid');
  await date.fill(dayBefore);
  await expect(dialog).toContainText('are locked');
  await expect(dialog.getByRole('button', { name: `Record ${isk(DAY_TAX)}` })).toBeDisabled();
  await date.fill(lock);
  await expect(dialog).not.toContainText('are locked');
  await dialog.getByRole('button', { name: `Record ${isk(DAY_TAX)}` }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main')).toContainText(`Paid${isk(DAY_TAX)}`);
  await expect(officerRow(page, /Payment from/)).toContainText(lock);
});

test('a day paid exactly and stored as paid stays paid when its close price later moves', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_703, amount: DAY_TAX, back: SAME_DAY };
  await book.seed([...pilotBook([SAME_DAY, NEXT_DAY]).docs(), credited(sent)]);
  esi(pilotEsi({ mining: miningLedger([SAME_DAY, NEXT_DAY]), journal: [sentDonation(sent)] }));
  await signInAsOfficer(page, minerUrl(PILOT_MINER_ID));
  await expect(officerLedger(page)).toBeVisible();
  await owed(page, DAY_TAX);
  // The officer's visit stores the paid day for good (`meta/paid`): its price was a saved close.
  await expect
    .poll(async () => (await readDoc(`corps/${CORP}/meta/paid`))?.minerPaidThrough, {
      message: 'the visit records what the account closed through',
    })
    .toEqual({ [PILOT_MINER_ID]: day(SAME_DAY) });

  // The hub's price for that day is later published at 1% more. The day was settled and stored:
  // it takes no more money and owes no remainder, on the officer's page and on the pilot's.
  await installDayPrices(page, { [SAME_DAY]: CLOSES.clearlyHigher.price });
  await page.reload();
  await expect(officerLedger(page)).toBeVisible();
  await owed(page, DAY_TAX);
  await owedDaysHeading(page, 1);
  await page.goto('./mining/tax').catch(() => page.goto('./mining/tax'));
  await expect(ledgerButton(page)).toContainText(isk(DAY_TAX));
});
