import { describe, it, expect } from 'vitest';
import {
  allocateRunningAccount,
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
    lines: [],
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
    expect(r.owes).toEqual({ amount: 6_000_000, days: 1, oldest: '2026-10-01' });
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
      paidThrough: '2026-11-02',
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
});
