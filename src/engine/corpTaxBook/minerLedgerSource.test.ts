import { describe, expect, it } from 'vitest';
import { payeeLedger } from '../miningTax/payeeLedger';
import { buildBookView, minerAccountOf, type BookViewInput } from './bookView';
import { minerLedgerSource, openDayCharges } from './minerLedgerSource';
import type { ObservedMiningEntry } from './types';
import type { BookRowView } from './personal';

const CORP = 98000001;
const ORE = 45490;
const entry = (date: string, quantity = 1000): ObservedMiningEntry => ({
  characterId: 1,
  recordedCorporationId: CORP,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});
const pay = (id: string, amount: number, at: string, note?: string) => ({
  id,
  minerId: 'solo:1',
  characterId: 1,
  amount,
  at,
  source: 'manual' as const,
  ...(note ? { note } : {}),
});

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-09-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [entry('2026-09-15'), entry('2026-09-16', 2000), entry('2026-09-18', 500)],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    ...overrides,
  };
}

const sourceOf = (
  v: ReturnType<typeof buildBookView>,
  names: Partial<Parameters<typeof minerLedgerSource>[2]> = {}
) =>
  minerLedgerSource(minerAccountOf(v, 'solo:1')!, v.input, {
    character: (id) => `Pilot ${id}`,
    ...names,
  });
const ledgerOf = (v: ReturnType<typeof buildBookView>) => payeeLedger(sourceOf(v));
const owedLessCredit = (v: ReturnType<typeof buildBookView>) =>
  v.miners[0]!.owed - v.miners[0]!.credit;

describe("minerLedgerSource: a Miner's account as the Payee ledger reads it", () => {
  it('ends at what the Miner owes less their credit, owed positive', () => {
    const view = buildBookView(
      input({ payments: [pay('p1', 150_000, '2026-09-17T10:00:00Z', 'Handed over in person')] })
    );
    const l = ledgerOf(view);
    expect(l.rows.at(-1)!.balance).toBeCloseTo(owedLessCredit(view), 6);
    expect(l.rows.map((r) => [r.date, r.kind, r.charged, r.paid])).toEqual([
      ['2026-09-15', 'charge', 100_000, 0],
      ['2026-09-16', 'charge', 200_000, 0],
      ['2026-09-17', 'payment', 0, 150_000],
    ]);
    const payment = l.rows.find((r) => r.kind === 'payment');
    expect(payment?.kind === 'payment' && payment.payment).toMatchObject({
      from: 'Pilot 1',
      note: 'Handed over in person',
    });
    expect(l.notYetBilled).toEqual({ tax: 50_000, days: 1 });
  });

  it('links each payment to where the caller says it sits in a wallet', () => {
    const view = buildBookView(
      input({
        payments: [
          pay('j3_5550123', 150_000, '2026-09-17T10:00:00Z'),
          pay('m-abc', 10_000, '2026-09-17T11:00:00Z'),
        ],
      })
    );
    const source = sourceOf(view, {
      walletHref: (id) => (id.startsWith('j') ? `/wallet/${id}` : undefined),
    });
    expect(new Map(source.payments?.map((p) => [p.id, p.href]))).toEqual(
      new Map([
        ['j3_5550123', '/wallet/j3_5550123'],
        ['m-abc', undefined],
      ])
    );
  });

  it('lists a correction, its reversal, and an officer write-off', () => {
    const adjustments = [
      {
        id: 'c1',
        minerId: 'solo:1',
        date: '2026-09-15',
        amount: 30_000,
        reason: 'Auth rollover',
        by: 2,
        at: '2026-09-16T00:00:00Z',
        reversed: { by: 2, at: '2026-09-17T00:00:00Z', reason: 'Entered twice' },
      },
      {
        id: 'o1',
        minerId: 'solo:1',
        date: '2026-09-15',
        amount: 5_000,
        reason: 'Brought over',
        by: 2,
        at: '2026-09-16T00:00:00Z',
        kind: 'opening' as const,
      },
    ];
    const writeOffs = [
      { id: 'w1', minerId: 'solo:1', amount: 50_000, at: '2026-09-17T12:00:00Z', reason: 'Left' },
    ];
    const view = buildBookView(input({ adjustments, writeOffs }));
    const l = ledgerOf(view);
    expect(l.rows.at(-1)!.balance).toBeCloseTo(owedLessCredit(view), 6);
    const keys = l.rows.map((r) => r.key);
    expect(sourceOf(view).charges.map((c) => c.id)).toEqual(expect.arrayContaining(['c1', 'o1']));
    expect(keys).toContain('charge:c1:reversal');
    expect(keys).toContain('writeOff:w1');
    const opening = l.rows.find((r) => r.key === 'charge:o1');
    expect(opening?.kind === 'charge' && opening.charge.opening).toBe(true);
  });

  it('opens at the checkpoint the account starts from', () => {
    const view = buildBookView(
      input({
        entries: [entry('2026-08-10'), entry('2026-09-10')],
        checkpoints: new Map([
          [
            'solo:1',
            {
              minerId: 'solo:1',
              through: '2026-08-31',
              owed: [{ date: '2026-08-10', remaining: 100_000, tax: 100_000, credited: 0 }],
              credit: 0,
              balance: 100_000,
              paidThrough: null,
              characterIds: [1],
              at: '2026-11-01T00:00:00Z',
            },
          ],
        ]),
      })
    );
    const l = ledgerOf(view);
    expect(l.rows[0]).toMatchObject({ kind: 'opening', date: '2026-08-31', charged: 100_000 });
    expect(l.rows.at(-1)!.balance).toBeCloseTo(owedLessCredit(view), 6);
  });
  it('names where a day was mined and who paid, and leaves out what the caller cannot name', () => {
    const view = buildBookView(input({ payments: [pay('p1', 150_000, '2026-09-17T10:00:00Z')] }));
    const named = sourceOf(view, { place: (l) => `Refinery ${l.structureId}` });
    expect(named.charges.map((c) => c.place)).toEqual(['Refinery 1001', 'Refinery 1001']);
    const unnamed = sourceOf(view, { character: () => undefined });
    expect(unnamed.charges.map((c) => c.place)).toEqual([undefined, undefined]);
    expect(unnamed.payments?.[0]).not.toHaveProperty('from');
  });

  it('lists a correction the account bills, not one dated past the days it bills', () => {
    const adjustment = (id: string, date: string) => ({
      id,
      minerId: 'solo:1',
      date,
      amount: 10_000,
      reason: id,
      by: 2,
      at: '2026-09-18T00:00:00Z',
    });
    const view = buildBookView(
      input({
        adjustments: [adjustment('billed', '2026-09-15'), adjustment('future', '2026-09-18')],
      })
    );
    const ids = sourceOf(view).charges.map((c) => c.id);
    expect(ids).toContain('billed');
    expect(ids).not.toContain('future');
    expect(ledgerOf(view).rows.at(-1)!.balance).toBeCloseTo(owedLessCredit(view), 6);
  });

  it('never pours a write-off dated before the snapshot into a day after it', () => {
    const checkpoint = {
      minerId: 'solo:1',
      through: '2026-08-31',
      owed: [{ date: '2026-08-10', remaining: 100_000, tax: 100_000, credited: 0 }],
      credit: 0,
      balance: 100_000,
      paidThrough: null,
      characterIds: [1],
      at: '2026-11-01T00:00:00Z',
    };
    const writeOffs = [
      {
        id: 'old',
        minerId: 'solo:1',
        amount: 30_000,
        at: '2026-08-20T12:00:00Z',
        reason: 'Before',
      },
      { id: 'new', minerId: 'solo:1', amount: 20_000, at: '2026-09-17T12:00:00Z', reason: 'After' },
    ];
    const view = buildBookView(
      input({
        entries: [entry('2026-08-10'), entry('2026-09-10')],
        checkpoints: new Map([['solo:1', checkpoint]]),
        writeOffs,
      })
    );
    const offs = ledgerOf(view).rows.filter((r) => r.kind === 'writeOff');
    expect(offs.map((r) => r.key)).toEqual(['writeOff:new']);
    expect(offs[0]!.kind === 'writeOff' && offs[0]!.days).toEqual([
      { date: '2026-08-10', amount: 20_000 },
    ]);
  });
});

describe('openDayCharges', () => {
  const row = (over: Partial<BookRowView>): BookRowView =>
    ({
      id: 'r',
      corporationId: 1,
      date: '2026-11-25',
      solarSystemId: 30,
      minerId: 'm1',
      billed: 100,
      oreLines: [{ typeId: 7, quantity: 10 }],
      open: true,
      ...over,
    }) as BookRowView;

  it("lists the Miner's open rows in the book, by refinery else system", () => {
    const charges = openDayCharges(
      [
        row({ id: 'a', refineryLabel: 'Palomino Prospecting' }),
        row({ id: 'b', billed: 40 }),
        row({ id: 'b:paid', billed: 60 }),
        row({ id: 'billed', open: undefined }),
        row({ id: 'other', minerId: 'm2' }),
        row({ id: 'corp', corporationId: 2 }),
      ],
      1,
      'm1',
      () => 'Ainsan'
    );
    expect(charges.map((c) => [c.id, c.place, c.tax, c.open])).toEqual([
      ['a', 'Palomino Prospecting', 100, true],
      ['b', 'Ainsan', 100, true],
    ]);
  });
});
