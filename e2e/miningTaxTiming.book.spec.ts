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
const cardOf = (page: Page, name = CORP_NAME) => page.getByRole('group', { name });
const creditNote = (page: Page, amount: number) =>
  page.getByRole('main').getByText(new RegExp(`${CORP_NAME}\\s*${isk(amount)}\\s*ISK`));
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

async function gotoMiner(page: Page) {
  await page.goto(minerUrl(PILOT_MINER_ID)).catch(() => page.goto(minerUrl(PILOT_MINER_ID)));
  await expect(officerLedger(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: PILOT.name })).toBeVisible();
}

const sentDonation = (p: { refId: number; amount: number; back: number; at?: string }) =>
  donationSent({ ...p, to: CORP, reason: CODE });
const credited = (p: { refId: number; amount: number; back: number; at?: string }) =>
  creditedDonation({ ...p, characterId: PILOT.id });

test('pilot side: a donation just sent counts at once, and is not counted again once the book credits it', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_101, amount: DAY_TAX, back: 1, at: justNow(30) };
  await openPilot(page, book, esi, {
    seed: pilotBook([6, 5, 4]),
    mined: [6, 5, 4],
    journal: [sentDonation(sent)],
  });
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await expect(pilotLedger(page)).toContainText(
    new RegExp(`Days owed\\s*2[\\s\\S]*Oldest unpaid${day(5)}`)
  );
  await page.keyboard.press('Escape');

  await book.seed([credited(sent)]);
  await page.reload();
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
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

test('Settle up for the book offers to record the payment, but writes nothing until pressed', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_103, amount: DAY_TAX, back: 0, at: justNow() };
  await openPilot(page, book, esi, { seed: pilotBook([6, 5, 4]), mined: [6, 5, 4] });
  await expect(cardOf(page)).toContainText(isk(3 * DAY_TAX));
  await cardOf(page).getByRole('button', { name: 'Settle up' }).click();
  const dialog = page.getByRole('dialog', { name: `Settle up — ${CORP_NAME}` });
  await expect(dialog).toContainText(`Amount${isk(3 * DAY_TAX)} ISK`);
  await expect(dialog).toContainText(`Reason${CODE}`);
  await expect(dialog.getByRole('button', { name: 'Record payment' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await readStore(page, 'miningTaxPaymentLinks')).toEqual([]);
  expect(await readStore(page, 'miningTaxAssignments')).toEqual([]);
  await expect(cardOf(page)).toContainText(isk(3 * DAY_TAX));

  await book.seed([credited(sent)]);
  await page.reload();
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
  expect(await readStore(page, 'miningTaxPaymentLinks')).toEqual([]);
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
});

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
    at: noonOf(1),
    recordedBy: OFFICER.id,
  };
  const seed = pilotBook([6, 5, 4]).raw('payments', hand.id, hand);
  const journal = [sentDonation({ ...sent, at: `${day(1)}T13:05:00.000Z` })];
  await openPilot(page, book, esi, { seed, mined: [6, 5, 4], journal });
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
  await expect(page.getByText('Payments to link')).toHaveCount(0);
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await page.keyboard.press('Escape');

  await book.seed([
    { path: `corps/${CORP}/payments/${hand.id}`, data: { ...hand, transferId: 'j1_970202' } },
  ]);
  await page.reload();
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
  await expect(page.getByText('Payments to link')).toHaveCount(0);
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);
});

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
  await expect(creditNote(page, ESTIMATE)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/You owe|Owes/);
  const today = page.getByRole('row').filter({ hasText: day(0) });
  await expect(today).toContainText(/pending corp record/i);
  await expect(today).not.toContainText(/billed|outstanding/i);
  await expect(page.getByText(/is closed \(/)).toBeVisible();

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
      await expect(creditNote(page, -gap)).toBeVisible();
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
      await expect(page.getByRole('row').filter({ hasText: day(SAME_DAY) })).toContainText(/paid/i);
      await expect(ledgerButton(page)).toHaveCount(0);
      await expect(page.getByRole('main')).not.toContainText(/You owe|Owes/);
      await dayRow().click();
      await page.getByRole('button', { name: `Open the ledger of ${CORP_NAME}` }).click();
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
      await expect(cardOf(page)).toContainText(isk(gap));
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
      await expect(cardOf(page)).toContainText(isk(DAY_TAX + gap));
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
    await expect(cardOf(page, ROOK.name)).toContainText(isk(ESTIMATE));
    const stored = () => readStore<MiningTaxAssignmentRecord>(page, 'miningTaxAssignments');
    expect((await stored()).map((a) => [a.date, a.taxOwed, a.estimatedValue])).toEqual([
      [day(0), ESTIMATE, 10 * ESTIMATE],
    ]);

    await installDayPrices(page, { 0: close.price });
    await page.reload();
    await expect(cardOf(page, ROOK.name)).toContainText(isk(ESTIMATE));
    expect((await stored()).map((a) => [a.taxOwed, a.estimatedValue])).toEqual([
      [ESTIMATE, 10 * ESTIMATE],
    ]);

    await cardOf(page, ROOK.name).getByRole('button', { name: 'Settle up' }).click();
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

test('a payment from before any mining is billed is held, then pays the first day billed', async ({
  page,
  book,
  esi,
}) => {
  const sent = { refId: 970_501, amount: 1.5 * DAY_TAX, back: SAME_DAY + 1 };
  await openPilot(page, book, esi, {
    seed: pilotBook([SAME_DAY, NEXT_DAY]),
    mined: [SAME_DAY, NEXT_DAY],
    extra: [credited(sent)],
    journal: [sentDonation(sent)],
  });
  await expect(cardOf(page)).toContainText(isk(0.5 * DAY_TAX));
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
  const before = { refId: 970_502, amount: 3 * DAY_TAX, back: 41 };
  const onStart = { refId: 970_503, amount: DAY_TAX, back: 40 };
  await openPilot(page, book, esi, {
    seed: pilotBook([6, 5, 4]),
    mined: [6, 5, 4],
    extra: [credited(before), credited(onStart)],
    journal: [sentDonation(before), sentDonation(onStart)],
  });
  await expect(cardOf(page)).toContainText(isk(2 * DAY_TAX));
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(page.getByRole('main')).toContainText(`Paid${isk(DAY_TAX)}`);
});

for (const exemption of [
  { forgive: 0, forgiven: 0, words: 'charged in full' },
  { forgive: 2_000, forgiven: 2_000, words: 'forgiven only up to 2,000' },
] as const) {
  test(`a payment short within the tolerance does not close the day when the shortfall is ${exemption.words}`, async ({
    page,
    book,
    esi,
  }) => {
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
    await expect(cardOf(page)).toContainText(isk(left));
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
  await expect(cardOf(page)).toContainText(isk(short));
});

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
  await expect(cardOf(page)).toContainText(isk(DAY_TAX));
  await ledgerButton(page).click();
  await expect(pilotLedger(page).getByRole('row', { name: /Payment/ })).toHaveCount(2);
  await page.keyboard.press('Escape');
  await gotoMiner(page);
  await owed(page, 2 * DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(1);

  await book.seed([credited(second)]);
  await gotoMiner(page);
  await owed(page, DAY_TAX);
  await expect(officerRow(page, /Payment from/)).toHaveCount(2);
  await page.goto('./mining/tax').catch(() => page.goto('./mining/tax'));
  await expect(cardOf(page)).toContainText(isk(DAY_TAX));
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
  await expect
    .poll(async () => (await readDoc(`corps/${CORP}/meta/paid`))?.minerPaidThrough, {
      message: 'the visit records what the account closed through',
    })
    .toEqual({ [PILOT_MINER_ID]: day(SAME_DAY) });

  await installDayPrices(page, { [SAME_DAY]: CLOSES.clearlyHigher.price });
  await page.reload();
  await expect(officerLedger(page)).toBeVisible();
  await owed(page, DAY_TAX);
  await owedDaysHeading(page, 1);
  await page.goto('./mining/tax').catch(() => page.goto('./mining/tax'));
  await expect(cardOf(page)).toContainText(isk(DAY_TAX));
});
