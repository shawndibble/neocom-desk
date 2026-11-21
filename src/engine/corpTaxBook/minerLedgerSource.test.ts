import { describe, expect, it } from 'vitest';
import { payeeLedger } from '../miningTax/payeeLedger';
import { buildBookView, type BookViewInput } from './bookView';
import { minerLedgerSource } from './minerLedgerSource';
import type { ObservedMiningEntry } from './types';

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

/** 1,000 ISK per unit at 10%: 1,000 units owe 100,000. */
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

const ledgerOf = (v: ReturnType<typeof buildBookView>) =>
  payeeLedger(minerLedgerSource(v, 'solo:1', { character: (id) => `Pilot ${id}` })!);
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
    // Today's mining is not billable yet: beside the ledger, not in it.
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
    const source = minerLedgerSource(view, 'solo:1', {
      character: (id) => `Pilot ${id}`,
      walletHref: (id) => (id.startsWith('j') ? `/wallet/${id}` : undefined),
    })!;
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
              at: '2026-09-01T00:00:00Z',
            },
          ],
        ]),
      })
    );
    const l = ledgerOf(view);
    expect(l.rows[0]).toMatchObject({ kind: 'opening', date: '2026-08-31', charged: 100_000 });
    expect(l.rows.at(-1)!.balance).toBeCloseTo(owedLessCredit(view), 6);
  });
});
