import { describe, expect, it } from 'vitest';
import { daySettleTolerance } from '@/engine/corpTaxBook/minerRunningAccount';
import { payableRows, wherePaymentGoes, type PayDay } from './paymentLanding';

const day = (date: string, taxOwed: number, over: Partial<PayDay> = {}): PayDay => ({
  id: `c:${date}`,
  date,
  taxOwed,
  ...over,
});
const held = { until: '2026-11-30', kind: 'notPaying' as const };
const results = (days: PayDay[], amount: number) =>
  wherePaymentGoes(days, amount).days.map((d) => d.result);

describe('wherePaymentGoes', () => {
  const days = [day('2026-11-01', 10_000_000), day('2026-11-02', 20_000_000)];

  it('pays oldest first whatever order the rows come in', () => {
    const out = wherePaymentGoes([...days].reverse(), 10_000_000);
    expect(out.days.map((d) => [d.date, d.result])).toEqual([
      ['2026-11-01', 'paid'],
      ['2026-11-02', 'next'],
    ]);
  });

  it('breaks a date tie by id', () => {
    const tie = [
      day('2026-11-01', 5_000_000, { id: 'b' }),
      day('2026-11-01', 5_000_000, { id: 'a' }),
    ];
    expect(wherePaymentGoes(tie, 5_000_000).days.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('settles a day within the tolerance', () => {
    const short = 10_000_000 - daySettleTolerance(10_000_000);
    expect(results(days, short)).toEqual(['paid', 'next']);
    expect(results(days, short - 1)).toEqual(['part', 'next']);
  });

  it('never lets a token amount pay a small day (no ISK floor per day)', () => {
    expect(results([day('2026-11-01', 90_000)], 1)).toEqual(['part']);
  });

  it('part-pays the day after the last whole one', () => {
    const out = wherePaymentGoes(days, 12_000_000);
    expect(out.days.map((d) => d.result)).toEqual(['paid', 'part']);
    expect(out.days[1].partAmount).toBe(2_000_000);
    expect(out.credit).toBe(0);
  });

  it('skips a held day and pays the one after it', () => {
    const three = [
      day('2026-11-01', 10_000_000),
      day('2026-11-02', 5_000_000, { held }),
      day('2026-11-03', 20_000_000),
    ];
    const out = wherePaymentGoes(three, 30_000_000);
    expect(out.days.map((d) => d.result)).toEqual(['paid', 'held', 'paid']);
    expect(out.days[1].held).toEqual(held);
  });

  it('never pays a held day, however much is sent', () => {
    const out = wherePaymentGoes([day('2026-11-01', 5_000_000, { held })], 99_000_000);
    expect(out.days[0].result).toBe('held');
    expect(out.credit).toBe(99_000_000);
  });

  it('keeps the rest as credit when every open day is covered', () => {
    expect(wherePaymentGoes(days, 35_000_000)).toMatchObject({ credit: 5_000_000 });
  });

  it('lands nowhere on zero or invalid amounts', () => {
    expect(results(days, 0)).toEqual(['next', 'next']);
    expect(results(days, Number.NaN)).toEqual(['next', 'next']);
    expect(wherePaymentGoes(days, -5).credit).toBe(0);
  });

  it('handles no open days', () => {
    expect(wherePaymentGoes([], 5)).toEqual({ days: [], credit: 5 });
  });
});

describe('payableRows', () => {
  it('leaves held days out of the default amount, but keeps them when nothing else is owed', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const holds = new Map([['b', { until: '2026-11-30', kind: 'notPaying' as const }]]);
    expect(payableRows(rows, (r) => holds.get(r.id))).toEqual([{ id: 'a' }]);
    expect(payableRows([rows[1]!], (r) => holds.get(r.id))).toEqual([{ id: 'b' }]);
  });
});
