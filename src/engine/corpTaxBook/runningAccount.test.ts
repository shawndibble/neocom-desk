import { describe, it, expect } from 'vitest';
import {
  allocateRunningAccount,
  closableThrough,
  daySettleTolerance,
  DAY_SETTLE_TOLERANCE_PCT,
  runningDaysFromLines,
  type RunningDay,
} from './runningAccount';
import type { TaxPayment } from './allocation';
import type { Statement, StatementLine } from './statements';

function payment(
  id: string,
  amount: number,
  at: string,
  extra: Partial<TaxPayment> = {}
): TaxPayment {
  return { id, minerId: 'm1', characterId: 90000001, amount, at, source: 'donation', ...extra };
}

function legacy(id: string, amount: number, issuedAt: string): Statement {
  return {
    id,
    minerId: 'm1',
    code: `NTX-${id}`,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    coversFrom: '2026-10-01',
    coversThrough: '2026-10-31',
    issuedAt,
    hubId: 'jita',
    oreForm: 'compressed',
    amount,
    lines: [
      { kind: 'mined', date: '2026-10-05', oreLines: [], estimatedValue: amount * 10, tax: amount },
    ],
  };
}

const day = (date: string, tax: number): RunningDay => ({ date, tax });
const NOV = [
  day('2026-11-01', 1_000_000),
  day('2026-11-02', 2_000_000),
  day('2026-11-03', 3_000_000),
];
const base = { statements: [], payments: [], dismissalCredits: [] };

describe('daySettleTolerance', () => {
  it('is a percent of the day, with no ISK floor', () => {
    expect(DAY_SETTLE_TOLERANCE_PCT).toBe(0.5);
    expect(daySettleTolerance(10_000_000)).toBe(50_000);
    expect(daySettleTolerance(90_000)).toBe(450);
    expect(daySettleTolerance(10_000_000, 1)).toBe(100_000);
  });
});

describe('runningDaysFromLines', () => {
  it('sums each date’s lines into one day, oldest first', () => {
    const line = (date: string, tax: number) =>
      ({ kind: 'mined', date, oreLines: [], estimatedValue: tax * 10, tax }) as StatementLine;
    expect(
      runningDaysFromLines([line('2026-11-02', 5), line('2026-11-01', 2), line('2026-11-02', 3)])
    ).toEqual([day('2026-11-01', 2), day('2026-11-02', 8)]);
  });
});

describe('allocateRunningAccount', () => {
  it('pays the oldest day first, by amount', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 2_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: true, remaining: 0 });
    expect(r.byDay.get('2026-11-02')).toMatchObject({
      credited: 1_000_000,
      remaining: 1_000_000,
      settled: false,
    });
    expect(r.byDay.get('2026-11-03')).toMatchObject({ credited: 0, settled: false });
    expect(r.paidThrough).toBe('2026-11-01');
    expect(r.owes).toEqual({ amount: 4_000_000, days: 2, oldest: '2026-11-02' });
    expect(r.credit).toBe(0);
  });

  it('settles a day a payment fell short of by no more than the tolerance, and writes the gap off', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', 10_000_000)],
      payments: [payment('p1', 9_960_000, '2026-11-01T12:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({
      settled: true,
      writtenOff: 40_000,
      remaining: 0,
    });
    expect(r.owes).toBeNull();
    expect(r.paidThrough).toBe('2026-11-01');
  });

  it('never lets a token payment pay a small day', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', 90_000)],
      payments: [payment('p1', 1, '2026-11-01T12:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: false, remaining: 89_999 });
  });

  it('forgives nothing on a day no payment reached', () => {
    const r = allocateRunningAccount({ ...base, days: [day('2026-11-01', 1_000)] });
    expect(r.byDay.get('2026-11-01')).toMatchObject({
      settled: false,
      remaining: 1_000,
      writtenOff: 0,
    });
    expect(r.paidThrough).toBeNull();
  });

  it('uses the book’s own tolerance', () => {
    const r = allocateRunningAccount({
      ...base,
      dayTolerancePct: 0,
      days: [day('2026-11-01', 10_000_000)],
      payments: [payment('p1', 9_999_000, '2026-11-01T12:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')?.settled).toBe(false);
  });

  it('holds only a true overpayment as credit', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 7_500_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.credit).toBe(1_500_000);
    expect(r.owes).toBeNull();
    expect(r.paidThrough).toBe('2026-11-03');
    expect(r.balance).toBe(-1_500_000);
  });

  it('pays legacy Statements before running days', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 5_000_000, '2026-11-01T00:00:00Z')],
      days: NOV,
      payments: [payment('p1', 6_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.legacy.byStatement.get('s1')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-02')?.credited).toBe(0);
    expect(r.owes).toEqual({ amount: 5_000_000, days: 2, oldest: '2026-11-02' });
  });

  it('counts an unpaid legacy Statement in what is owed, from its first day', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 5_000_000, '2026-11-01T00:00:00Z')],
      days: [day('2026-11-01', 1_000_000)],
    });
    expect(r.owes).toEqual({ amount: 6_000_000, days: 2, oldest: '2026-10-05' });
    expect(r.paidThrough).toBeNull();
  });

  it('skips a held day: not owed while its dispute is open, and money passes over it', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      heldDays: new Set(['2026-11-01']),
      payments: [payment('p1', 2_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ held: true, credited: 0, settled: false });
    expect(r.byDay.get('2026-11-02')?.settled).toBe(true);
    expect(r.owes).toEqual({ amount: 3_000_000, days: 1, oldest: '2026-11-03' });
    expect(r.paidThrough).toBe('2026-11-02');
  });

  it('applies a write-off with no Statement to running days after payments; the rest is dropped', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 1_000_000, '2026-11-04T10:00:00Z')],
      officerWriteOffs: [{ id: 'w1', amount: 10_000_000, at: '2026-11-05T00:00:00Z' }],
    });
    expect([...r.byDay.values()].every((d) => d.settled)).toBe(true);
    expect(r.byDay.get('2026-11-02')).toMatchObject({ forgiven: 2_000_000 });
    expect(r.credit).toBe(0);
    expect(r.owes).toBeNull();
  });

  it('keeps a day at or before the stored paid-through settled when money is taken back', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      storedPaidThrough: '2026-11-02',
      payments: [payment('p1', 3_000_000, '2026-11-04T10:00:00Z', { notTaxAmount: 3_000_000 })],
    });
    expect(r.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-02')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-03')?.settled).toBe(false);
    expect(r.owes).toEqual({ amount: 3_000_000, days: 1, oldest: '2026-11-03' });
  });

  it('treats a day that came out negative (a credit correction) as credit', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', -500_000), day('2026-11-02', 1_000_000)],
    });
    expect(r.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-02')).toMatchObject({ credited: 500_000, remaining: 500_000 });
  });

  it('drops a donation dated before the book’s start', () => {
    const r = allocateRunningAccount({
      ...base,
      startDate: '2026-11-01',
      days: NOV,
      payments: [payment('p1', 1_000_000, '2026-10-30T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')?.settled).toBe(false);
  });

  it('sends a payment coded to a Statement on to the oldest day once the Statement is paid', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 1_000_000, '2026-11-01T00:00:00Z')],
      days: NOV,
      payments: [payment('p1', 2_000_000, '2026-11-04T10:00:00Z', { statementId: 's1' })],
    });
    expect(r.legacy.byStatement.get('s1')?.settled).toBe(true);
    expect(r.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(r.owes?.oldest).toBe('2026-11-02');
  });

  it('pays dates oldest first whatever order they come in, adding up entries for one date', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-02', 1_000_000), day('2026-11-01', 400_000), day('2026-11-01', 600_000)],
      payments: [payment('p1', 1_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ tax: 1_000_000, settled: true });
    expect(r.byDay.get('2026-11-02')?.settled).toBe(false);
    expect(r.balance).toBe(1_000_000);
  });

  it('pays a day already recorded paid first, then the next owed day, so no payment is counted twice', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      storedPaidThrough: '2026-11-01',
      payments: [payment('p1', 3_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: true, credited: 1_000_000 });
    expect(r.byDay.get('2026-11-02')).toMatchObject({ settled: true, credited: 2_000_000 });
    expect(r.paidThrough).toBe('2026-11-02');
    expect(r.credit).toBe(0);
  });

  it('keeps an officer charge on a day recorded paid owed, instead of forgiving it', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [{ date: '2026-11-01', tax: 1_500_000, charge: 500_000 }, day('2026-11-02', 2_000_000)],
      storedPaidThrough: '2026-11-02',
      payments: [payment('p1', 3_000_000, '2026-11-04T10:00:00Z')],
    });
    // Oldest first: the payment fills 1 Nov, so the 500,000 charge is what 2 Nov ends short.
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: true, credited: 1_500_000 });
    expect(r.byDay.get('2026-11-02')).toMatchObject({
      settled: false,
      writtenOff: 0,
      remaining: 500_000,
    });
    expect(r.owes).toEqual({ amount: 500_000, days: 1, oldest: '2026-11-02' });
    expect(r.balance).toBe(500_000);
  });

  describe('an officer’s tolerance exemption for a day', () => {
    const tenMillion = [day('2026-11-01', 10_000_000)];
    const shortBy = (shortfall: number, exempt: number | undefined) =>
      allocateRunningAccount({
        ...base,
        days: tenMillion,
        payments: [payment('p1', 10_000_000 - shortfall, '2026-11-04T10:00:00Z')],
        ...(exempt !== undefined ? { toleranceExemptions: new Map([['2026-11-01', exempt]]) } : {}),
      });

    it('forgives a shortfall within the book’s tolerance when there is none', () => {
      expect(shortBy(30_000, undefined).byDay.get('2026-11-01')).toMatchObject({
        settled: true,
        writtenOff: 30_000,
      });
    });

    it('owes the whole shortfall when the exemption forgives nothing', () => {
      const r = shortBy(30_000, 0);
      expect(r.byDay.get('2026-11-01')).toMatchObject({
        settled: false,
        writtenOff: 0,
        remaining: 30_000,
      });
      expect(r.owes).toEqual({ amount: 30_000, days: 1, oldest: '2026-11-01' });
    });

    it('applies to a day recorded paid too: reversing its tolerance charges the shortfall', () => {
      const r = allocateRunningAccount({
        ...base,
        days: tenMillion,
        storedPaidThrough: '2026-11-01',
        payments: [payment('p1', 9_970_000, '2026-11-04T10:00:00Z')],
        toleranceExemptions: new Map([['2026-11-01', 0]]),
      });
      expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: false, remaining: 30_000 });
      expect(r.owes?.amount).toBe(30_000);
    });

    it('forgives up to the amount set and leaves the rest owed', () => {
      const r = shortBy(300_000, 100_000);
      expect(r.byDay.get('2026-11-01')).toMatchObject({
        settled: false,
        writtenOff: 100_000,
        remaining: 200_000,
      });
      expect(r.owes?.amount).toBe(200_000);
    });

    it('forgives all of a shortfall that is within the amount set, even past the tolerance', () => {
      expect(shortBy(300_000, 400_000).byDay.get('2026-11-01')).toMatchObject({
        settled: true,
        writtenOff: 300_000,
      });
    });
  });

  it('does not owe a charge on a recorded-paid day that is paid to within tolerance', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [{ date: '2026-11-01', tax: 10_000_000, charge: 4_000_000 }],
      storedPaidThrough: '2026-11-01',
      payments: [payment('p1', 9_970_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: true, remaining: 0 });
    expect(r.owes).toBeNull();
  });

  it('does not let a held recorded-paid day use up the pool of an officer charge', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [
        { date: '2026-11-01', tax: 1_000_000 },
        { date: '2026-11-02', tax: 1_000_000, charge: 400_000 },
      ],
      heldDays: new Set(['2026-11-01']),
      storedPaidThrough: '2026-11-02',
      payments: [payment('p1', 600_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.byDay.get('2026-11-02')).toMatchObject({ remaining: 400_000, settled: false });
  });

  it('still closes the rest of a day recorded paid when money is taken back from it', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [{ date: '2026-11-01', tax: 1_500_000, charge: 500_000 }],
      storedPaidThrough: '2026-11-01',
      payments: [payment('p1', 400_000, '2026-11-04T10:00:00Z')],
    });
    // 1,100,000 short: the 500,000 charge stays owed, the rest of the old day is closed out.
    expect(r.byDay.get('2026-11-01')).toMatchObject({ writtenOff: 600_000, remaining: 500_000 });
  });

  it('keeps the stored paid-through when there are no days', () => {
    const r = allocateRunningAccount({ ...base, days: [], storedPaidThrough: '2026-11-03' });
    expect(r.paidThrough).toBe('2026-11-03');
    expect(r.owes).toBeNull();
  });

  it('never moves paid-through onto a held day', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', 1_000_000), day('2026-11-02', 1_000_000)],
      heldDays: new Set(['2026-11-02']),
      payments: [payment('p1', 1_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.paidThrough).toBe('2026-11-01');
    expect(r.owes).toBeNull();
    expect(r.balance).toBe(0);
  });

  it('leaves a held day out of the balance, as it is not due', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      heldDays: new Set(['2026-11-01']),
      payments: [payment('p1', 2_000_000, '2026-11-04T10:00:00Z')],
    });
    expect(r.balance).toBe(r.owes!.amount);
  });

  it('forgives no shortfall on a day only a credit correction reached', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', -9_990_000, '2026-11-01T00:00:00Z')],
      days: [day('2026-11-01', 10_000_000)],
    });
    expect(r.byDay.get('2026-11-01')).toMatchObject({ settled: false, remaining: 10_000 });
  });
});

describe('allocateRunningAccount applications', () => {
  const T = (n: number) => `2026-11-04T10:0${n}:00Z`;
  const paymentOf = (r: ReturnType<typeof allocateRunningAccount>, id: string) =>
    r.applications.payments.find((p) => p.paymentId === id);

  it('spreads one payment over the days it covered, oldest first', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 2_000_000, T(0))],
    });
    expect(paymentOf(r, 'p1')).toEqual({
      paymentId: 'p1',
      statements: [],
      days: [
        { date: '2026-11-01', amount: 1_000_000 },
        { date: '2026-11-02', amount: 1_000_000 },
      ],
      credit: 0,
    });
  });

  it('gives each payment its own slice of a day, in payment order', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p2', 1_500_000, T(1)), payment('p1', 1_500_000, T(0))],
    });
    expect(paymentOf(r, 'p1')?.days).toEqual([
      { date: '2026-11-01', amount: 1_000_000 },
      { date: '2026-11-02', amount: 500_000 },
    ]);
    expect(paymentOf(r, 'p2')?.days).toEqual([{ date: '2026-11-02', amount: 1_500_000 }]);
  });

  it('keeps what no day absorbed as the payment’s credit', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 3_000_000, T(0))],
    });
    expect(paymentOf(r, 'p1')).toMatchObject({
      days: [{ date: '2026-11-01', amount: 1_000_000 }],
      credit: 2_000_000,
    });
    expect(r.credit).toBe(2_000_000);
  });

  it('attributes exactly what the pooled allocation credits when the tolerance closes a day mid-run', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-11-01', 10_000_000), day('2026-11-02', 5_000_000)],
      payments: [payment('p1', 9_970_000, T(0)), payment('p2', 1_000_000, T(1))],
    });
    expect(r.byDay.get('2026-11-01')?.credited).toBe(10_000_000);
    expect(paymentOf(r, 'p1')?.days).toEqual([{ date: '2026-11-01', amount: 9_970_000 }]);
    expect(paymentOf(r, 'p2')?.days).toEqual([
      { date: '2026-11-01', amount: 30_000 },
      { date: '2026-11-02', amount: 970_000 },
    ]);
  });

  it('leaves out the part of a payment that was not tax', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 2_000_000, T(0), { notTaxAmount: 1_500_000 })],
    });
    expect(paymentOf(r, 'p1')?.days).toEqual([{ date: '2026-11-01', amount: 500_000 }]);
  });

  it('applies nothing for a donation dated before the book started', () => {
    const r = allocateRunningAccount({
      ...base,
      startDate: '2026-11-02',
      days: NOV,
      payments: [payment('p1', 1_000_000, '2026-11-01T10:00:00Z')],
    });
    expect(r.applications.payments).toEqual([]);
    expect(r.byDay.get('2026-11-01')?.credited).toBe(0);
  });

  it('names the legacy Statement a payment settled before the days', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 1_000_000, '2026-11-01T00:00:00Z')],
      days: NOV,
      payments: [payment('p1', 1_500_000, T(0))],
    });
    expect(paymentOf(r, 'p1')).toMatchObject({
      statements: [{ statementId: 's1', amount: 1_000_000 }],
      days: [{ date: '2026-11-01', amount: 500_000 }],
      credit: 0,
    });
  });

  it('sends a payment coded to an already-paid Statement entirely to the days', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 1_000_000, '2026-11-01T00:00:00Z')],
      days: NOV,
      payments: [
        payment('p1', 1_000_000, T(0), { statementId: 's1' }),
        payment('p2', 1_000_000, T(1), { statementId: 's1' }),
      ],
    });
    expect(paymentOf(r, 'p2')).toMatchObject({
      statements: [],
      days: [{ date: '2026-11-01', amount: 1_000_000 }],
    });
  });

  it('reports a credit correction apart from payments', () => {
    const r = allocateRunningAccount({
      ...base,
      days: [day('2026-10-31', -500_000), ...NOV],
      payments: [payment('p1', 1_000_000, T(0))],
    });
    expect(r.applications.corrections).toEqual([{ date: '2026-11-01', amount: 500_000 }]);
    expect(paymentOf(r, 'p1')?.days).toEqual([
      { date: '2026-11-01', amount: 500_000 },
      { date: '2026-11-02', amount: 500_000 },
    ]);
    expect(r.applications.writeOffs).toEqual([]);
  });

  it('reports a dismissal’s leftover as a correction, not as any payment’s credit', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 1_000_000, '2026-11-01T00:00:00Z')],
      dismissalCredits: [
        { statementId: 's1', dismissalId: 'd1', chargeKey: 'k1', amount: 1_500_000 },
      ],
      days: NOV,
      payments: [payment('p1', 1_000_000, T(0))],
    });
    expect(r.applications.corrections).toEqual([{ date: '2026-11-01', amount: 500_000 }]);
    expect(paymentOf(r, 'p1')?.days).toEqual([
      { date: '2026-11-01', amount: 500_000 },
      { date: '2026-11-02', amount: 500_000 },
    ]);
  });

  it('applies nothing for a payment that carried no tax', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 1_000_000, T(0), { notTaxAmount: 1_000_000 })],
    });
    expect(r.applications.payments).toEqual([]);
    expect(r.byDay.get('2026-11-01')?.credited).toBe(0);
  });

  it('lets a payment a legacy Statement fully absorbed leave the next payment its own days', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 1_000_000, '2026-11-01T00:00:00Z')],
      days: NOV,
      payments: [payment('p1', 1_000_000, T(0)), payment('p2', 500_000, T(1))],
    });
    expect(paymentOf(r, 'p1')).toEqual({
      paymentId: 'p1',
      statements: [{ statementId: 's1', amount: 1_000_000 }],
      days: [],
      credit: 0,
    });
    expect(paymentOf(r, 'p2')?.days).toEqual([{ date: '2026-11-01', amount: 500_000 }]);
  });

  it('reports an officer write-off with no Statement apart from payments, and drops its leftover', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      payments: [payment('p1', 1_000_000, T(0))],
      officerWriteOffs: [{ id: 'w1', amount: 400_000, at: T(1) }],
    });
    expect(r.applications.writeOffs).toEqual([{ date: '2026-11-02', amount: 400_000 }]);
    expect(paymentOf(r, 'p1')?.days).toEqual([{ date: '2026-11-01', amount: 1_000_000 }]);
    expect(r.applications.corrections).toEqual([]);
  });

  it('applies nothing to a held day, and money passes over it', () => {
    const held = allocateRunningAccount({
      ...base,
      days: NOV,
      heldDays: new Set(['2026-11-01']),
      payments: [payment('p1', 1_000_000, T(0))],
    });
    expect(paymentOf(held, 'p1')?.days).toEqual([{ date: '2026-11-02', amount: 1_000_000 }]);
  });

  it('a day recorded paid still takes the payment that paid it, so that money is not credit too', () => {
    const r = allocateRunningAccount({
      ...base,
      days: NOV,
      storedPaidThrough: '2026-11-03',
      payments: [payment('p1', 10_000_000, T(0))],
    });
    expect(paymentOf(r, 'p1')?.days).toEqual([
      { date: '2026-11-01', amount: 1_000_000 },
      { date: '2026-11-02', amount: 2_000_000 },
      { date: '2026-11-03', amount: 3_000_000 },
    ]);
    expect(r.credit).toBe(4_000_000);
    expect(r.balance).toBe(-4_000_000);
    expect(r.owes).toBeNull();
  });

  it('accounts for every unit of a payment: statements, days and credit add up to its net amount', () => {
    const r = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 700_000, '2026-11-01T00:00:00Z')],
      days: [day('2026-10-31', -200_000), ...NOV],
      payments: [
        payment('p1', 2_000_000, T(0), { notTaxAmount: 100_000 }),
        payment('p2', 9_000_000, T(1)),
      ],
      officerWriteOffs: [{ id: 'w1', amount: 300_000, at: T(2) }],
    });
    const nets: Record<string, number> = { p1: 1_900_000, p2: 9_000_000 };
    for (const p of r.applications.payments) {
      const sum =
        p.statements.reduce((s, x) => s + x.amount, 0) +
        p.days.reduce((s, x) => s + x.amount, 0) +
        p.credit;
      expect(sum).toBe(nets[p.paymentId]);
    }
    const dayTotal = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
    const credited = [...r.byDay.values()].reduce((s, d) => s + d.credited, 0);
    expect(
      dayTotal(r.applications.payments.flatMap((p) => p.days)) +
        dayTotal(r.applications.corrections) +
        dayTotal(r.applications.writeOffs)
    ).toBe(credited);
  });
});

describe('closableThrough', () => {
  const dayOf = (date: string, tax: number, savedPrices = true) => ({ date, tax, savedPrices });
  const paidDays = [dayOf('2026-11-01', 1_000_000), dayOf('2026-11-02', 2_000_000)];
  const account = (days: RunningDay[], payAmount: number, storedPaidThrough?: string) =>
    allocateRunningAccount({
      ...base,
      days,
      payments: [payment('p1', payAmount, '2026-11-04T00:00:00Z')],
      ...(storedPaidThrough ? { storedPaidThrough } : {}),
    });
  const call = (
    days: ReturnType<typeof dayOf>[],
    pay: number,
    extra: Partial<Parameters<typeof closableThrough>[0]> = {}
  ) =>
    closableThrough({
      account: account(days, pay),
      days,
      heldDays: new Set(),
      today: '2026-11-10',
      ...extra,
    });

  it('is the newest paid day when every day has saved prices', () => {
    expect(call(paidDays, 3_000_000)).toBe('2026-11-02');
  });

  it('stops before a day with no saved close-of-day price', () => {
    const days = [dayOf('2026-11-01', 1_000_000), dayOf('2026-11-02', 0, false)];
    expect(call(days, 1_000_000)).toBe('2026-11-01');
  });

  it('is null when the first day has no saved price', () => {
    expect(call([dayOf('2026-11-01', 0, false)], 0)).toBeNull();
  });

  it('stops before a day an open dispute holds', () => {
    const days = [...paidDays, dayOf('2026-11-03', 3_000_000)];
    expect(call(days, 6_000_000, { heldDays: new Set(['2026-11-02']) })).toBe('2026-11-01');
  });

  it('stops before today, whose ore is still coming in', () => {
    const days = [dayOf('2026-11-01', 1_000_000), dayOf('2026-11-10', 0)];
    expect(call(days, 1_000_000)).toBe('2026-11-01');
  });

  it('stops before a day still owed', () => {
    expect(call(paidDays, 1_000_000)).toBe('2026-11-01');
  });

  it('is null while a Statement is unpaid', () => {
    const a = allocateRunningAccount({
      ...base,
      statements: [legacy('s1', 500, '2026-10-31T00:00:00Z')],
      days: paidDays,
      payments: [],
    });
    expect(
      closableThrough({ account: a, days: paidDays, heldDays: new Set(), today: '2026-11-10' })
    ).toBeNull();
  });

  it('never goes before the stored day', () => {
    const a = account(paidDays, 0, '2026-11-02');
    expect(
      closableThrough({ account: a, days: paidDays, heldDays: new Set(), today: '2026-11-10' })
    ).toBe('2026-11-02');
  });
});
