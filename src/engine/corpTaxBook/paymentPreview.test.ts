import { describe, expect, it } from 'vitest';
import type { MinerRunningAccountInput } from './minerRunningAccount';
import { previewPayment } from './paymentPreview';
import { netPayment, type TaxPayment } from './payments';

function payment(id: string, amount: number, at: string, extra: Partial<TaxPayment> = {}) {
  return {
    id,
    minerId: 'm1',
    characterId: 1,
    amount,
    at,
    source: 'manual',
    ...extra,
  } satisfies TaxPayment;
}

const book = (extra: Partial<MinerRunningAccountInput> = {}): MinerRunningAccountInput => ({
  days: [
    { date: '2026-06-10', tax: 10_000_000 },
    { date: '2026-07-10', tax: 8_000_000 },
    { date: '2026-08-10', tax: 6_000_000 },
  ],
  payments: [],
  ...extra,
});

describe('previewPayment', () => {
  it('pays the oldest day and part-pays the next', () => {
    const out = previewPayment(book(), payment('new', 13_000_000, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([
      { date: '2026-06-10', applied: 10_000_000, remainingAfter: 0, settled: true },
      { date: '2026-07-10', applied: 3_000_000, remainingAfter: 5_000_000, settled: false },
    ]);
    expect(out.owedBefore).toBe(24_000_000);
    expect(out.owedAfter).toBe(11_000_000);
    expect(out.creditAdded).toBe(0);
  });

  it('skips what earlier payments already paid', () => {
    const out = previewPayment(
      book({ payments: [payment('old', 10_000_000, '2026-07-01T00:00:00Z')] }),
      payment('new', 2_000_000, '2026-09-05T00:00:00Z')
    );
    expect(out.lines.map((l) => l.date)).toEqual(['2026-07-10']);
  });

  it('holds an overpayment as credit', () => {
    const out = previewPayment(book(), payment('new', 30_000_000, '2026-09-05T00:00:00Z'));
    expect(out.owedAfter).toBe(0);
    expect(out.creditAfter).toBe(6_000_000);
    expect(out.creditAdded).toBe(6_000_000);
  });

  it('pays a day within its tolerance in full', () => {
    const out = previewPayment(book(), payment('new', 9_960_000, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([
      { date: '2026-06-10', applied: 9_960_000, remainingAfter: 0, settled: true },
    ]);
  });

  it('takes nothing for an amount of zero', () => {
    const out = previewPayment(book(), payment('new', 0, '2026-09-05T00:00:00Z'));
    expect(out.lines).toEqual([]);
    expect(out.owedAfter).toBe(out.owedBefore);
  });

  it('credits a Miner who owes nothing in full', () => {
    const out = previewPayment(
      book({ days: [] }),
      payment('new', 5_000_000, '2026-09-05T00:00:00Z')
    );
    expect(out).toMatchObject({ lines: [], owedBefore: 0, owedAfter: 0, creditAdded: 5_000_000 });
  });
});

describe('netPayment', () => {
  it('takes off the part marked not tax, never below zero', () => {
    expect(netPayment({ amount: 100 })).toBe(100);
    expect(netPayment({ amount: 100, notTaxAmount: 30 })).toBe(70);
    expect(netPayment({ amount: 100, notTaxAmount: 500 })).toBe(0);
  });
});
