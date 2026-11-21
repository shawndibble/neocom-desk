import { describe, expect, it } from 'vitest';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
} from '../corpTaxBook/minerRunningAccount';
import type { TaxPayment } from '../corpTaxBook/allocation';
import { payeeLedger, type LedgerCharge, type PayeeLedgerSource } from './payeeLedger';

const payment = (id: string, amount: number, at: string): TaxPayment => ({
  id,
  minerId: 'm1',
  characterId: 1,
  amount,
  at,
  source: 'donation',
});

const charge = (id: string, date: string, tax: number, over: Partial<LedgerCharge> = {}) =>
  ({ id, date, kind: 'mined', tax, ...over }) as LedgerCharge;

/** Builds the account from the same charges and payments the ledger is given, as a caller does. */
function source(
  charges: LedgerCharge[],
  payments: TaxPayment[],
  more: Partial<Omit<MinerRunningAccountInput, 'writeOffs'>> &
    Pick<PayeeLedgerSource, 'writeOffs' | 'notices'> = {}
): PayeeLedgerSource {
  const { writeOffs, notices, ...input } = more;
  const account = MinerRunningAccount.build({
    days: charges.map((c) => ({ date: c.date, tax: c.tax })),
    payments,
    writeOffs: writeOffs?.map((w) => ({ id: w.id, amount: w.amount })),
    ...input,
  });
  return {
    account,
    charges,
    payments: payments.map((p) => ({ id: p.id, at: p.at })),
    ...(writeOffs ? { writeOffs } : {}),
    ...(notices ? { notices } : {}),
  };
}

const MINED = [
  charge('a', '2026-10-01', 600_000, {
    place: 'Refinery A',
    ore: [{ typeId: 45490, quantity: 10 }],
  }),
  charge('b', '2026-10-01', 400_000, { place: 'Refinery B' }),
  charge('c', '2026-10-02', 2_000_000),
  charge('d', '2026-10-03', 500_000),
];

describe('payeeLedger', () => {
  it('lists charges and payments oldest first with a running balance that ends at the account balance', () => {
    const src = source(MINED, [payment('p1', 1_000_000, '2026-10-02T12:00:00Z')]);
    const ledger = payeeLedger(src);
    expect(ledger.rows.map((r) => [r.date, r.kind, r.charged, r.paid, r.balance])).toEqual([
      ['2026-10-01', 'charge', 600_000, 0, 600_000],
      ['2026-10-01', 'charge', 400_000, 0, 1_000_000],
      ['2026-10-02', 'charge', 2_000_000, 0, 3_000_000],
      ['2026-10-02', 'payment', 0, 1_000_000, 2_000_000],
      ['2026-10-03', 'charge', 500_000, 0, 2_500_000],
    ]);
    expect(ledger.rows.at(-1)!.balance).toBe(src.account.balance);
  });

  it('puts a day’s charges before a payment made earlier that day', () => {
    const ledger = payeeLedger(
      source(
        [charge('c', '2026-10-02', 2_000_000)],
        [payment('p1', 500_000, '2026-10-02T00:05:00Z')]
      )
    );
    expect(ledger.rows.map((r) => r.kind)).toEqual(['charge', 'payment']);
  });

  it('says which days a payment paid, and what it left as credit', () => {
    const ledger = payeeLedger(
      source(MINED.slice(0, 2), [payment('p1', 1_250_000, '2026-10-02T12:00:00Z')])
    );
    const row = ledger.rows.find((r) => r.kind === 'payment');
    expect(row).toMatchObject({
      kind: 'payment',
      paid: 1_250_000,
      days: [{ date: '2026-10-01', amount: 1_000_000 }],
      credit: 250_000,
    });
    expect(ledger.credit).toBe(250_000);
    expect(row!.balance).toBe(-250_000);
  });

  it('writes off a tolerance shortfall on the payment that closed the day', () => {
    const src = source(MINED, [
      payment('p1', 1_000_000, '2026-10-02T12:00:00Z'),
      payment('p2', 1_995_000, '2026-10-04T12:00:00Z'),
    ]);
    const ledger = payeeLedger(src);
    const at = ledger.rows.findIndex((r) => r.kind === 'payment' && r.key === 'payment:p2');
    expect(ledger.rows[at + 1]).toMatchObject({
      kind: 'writeOff',
      cause: 'tolerance',
      date: '2026-10-04',
      paid: 5_000,
      days: [{ date: '2026-10-02', amount: 5_000 }],
    });
    expect(ledger.rows.at(-1)!.balance).toBe(src.account.balance);
    expect(ledger.status).toEqual({
      kind: 'owes',
      amount: 500_000,
      days: 1,
      oldest: '2026-10-03',
    });
  });

  it('shows an officer write-off on its date with the days it forgave', () => {
    const src = source(MINED, [payment('p1', 1_000_000, '2026-10-02T12:00:00Z')], {
      writeOffs: [{ id: 'w1', at: '2026-10-05T10:00:00Z', amount: 200_000, reason: 'Goodwill' }],
    });
    const ledger = payeeLedger(src);
    expect(ledger.rows.at(-1)).toMatchObject({
      kind: 'writeOff',
      cause: 'officer',
      date: '2026-10-05',
      paid: 200_000,
      reason: 'Goodwill',
      days: [{ date: '2026-10-02', amount: 200_000 }],
      balance: 2_300_000,
    });
    expect(ledger.rows.at(-1)!.balance).toBe(src.account.balance);
  });

  it('gives a write-off that found nothing left to forgive no amount', () => {
    const ledger = payeeLedger(
      source(MINED.slice(0, 1), [payment('p1', 600_000, '2026-10-02T12:00:00Z')], {
        writeOffs: [{ id: 'w1', at: '2026-10-05T10:00:00Z', amount: 100_000 }],
      })
    );
    expect(ledger.rows.at(-1)).toMatchObject({ kind: 'writeOff', paid: 0, days: [], balance: 0 });
  });

  it('lists a late notice as an event with no amount, and where its days stand', () => {
    const ledger = payeeLedger(
      source(MINED, [payment('p1', 1_000_000, '2026-10-02T12:00:00Z')], {
        notices: [
          {
            id: 'n1',
            kind: 'late',
            issuedAt: '2026-10-04T09:00:00Z',
            lines: [
              { date: '2026-10-02', tax: 2_000_000 },
              { date: '2026-10-03', tax: 500_000 },
            ],
          },
        ],
      })
    );
    const row = ledger.rows.at(-1)!;
    expect(row).toMatchObject({ kind: 'notice', date: '2026-10-04', charged: 0, paid: 0 });
    expect(row.balance).toBe(2_500_000);
    expect(row.kind === 'notice' && row.standing).toMatchObject({
      due: 2_500_000,
      remaining: 2_500_000,
      settled: false,
    });
  });

  it('keeps a held day’s charge off the balance', () => {
    const src = source(MINED.slice(2), [], { heldDays: new Set(['2026-10-02']) });
    const ledger = payeeLedger(src);
    expect(ledger.rows[0]).toMatchObject({ kind: 'charge', held: true, balance: 0 });
    expect(ledger.rows.at(-1)!.balance).toBe(src.account.balance);
  });

  it('takes a credit Adjustment off the balance', () => {
    const src = source(
      [
        charge('c', '2026-10-02', 2_000_000),
        charge('adj', '2026-10-03', -300_000, { kind: 'correction', reason: 'Wrong rate' }),
      ],
      []
    );
    const ledger = payeeLedger(src);
    expect(ledger.rows.at(-1)).toMatchObject({
      kind: 'charge',
      charged: -300_000,
      balance: 1_700_000,
    });
    expect(ledger.rows.at(-1)!.balance).toBe(src.account.balance);
  });

  it('reads Paid through when nothing is owed, and nothing before any day is billed', () => {
    const paid = payeeLedger(
      source(MINED.slice(0, 2), [payment('p1', 1_000_000, '2026-10-02T12:00:00Z')])
    );
    expect(paid.status).toEqual({ kind: 'paid', through: '2026-10-01' });
    expect(payeeLedger(source([], [])).status).toEqual({ kind: 'none' });
    expect(payeeLedger(source([], [])).rows).toEqual([]);
  });

  it('skips a payment the source does not describe', () => {
    const src = source(MINED.slice(0, 1), [payment('p1', 600_000, '2026-10-02T12:00:00Z')]);
    expect(payeeLedger({ ...src, payments: [] }).rows.map((r) => r.kind)).toEqual(['charge']);
  });
});
