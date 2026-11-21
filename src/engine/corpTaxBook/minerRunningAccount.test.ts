import { describe, it, expect } from 'vitest';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
  type RunningDay,
} from './minerRunningAccount';
import { allocateRunningAccount } from './runningAccount';
import type { TaxPayment } from './allocation';

const day = (date: string, tax: number): RunningDay => ({ date, tax });
const payment = (id: string, amount: number, at: string, extra: Partial<TaxPayment> = {}) =>
  ({ id, minerId: 'm1', characterId: 90000001, amount, at, source: 'donation', ...extra }) as const;

describe('MinerRunningAccount.build', () => {
  it('pays the oldest day first and carries the rest as credit', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 2_000_000), day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 4_000_000, '2026-11-03T10:00:00Z')],
    });
    expect(account.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(account.byDay.get('2026-11-02')?.settled).toBe(true);
    expect(account.credit).toBe(1_000_000);
    expect(account.balance).toBe(-1_000_000);
    expect(account.paidThrough).toBe('2026-11-02');
    expect(account.owes).toBeNull();
    expect(account.applications.payments).toEqual([
      {
        paymentId: 'p1',
        days: [
          { date: '2026-11-01', amount: 1_000_000 },
          { date: '2026-11-02', amount: 2_000_000 },
        ],
        credit: 1_000_000,
      },
    ]);
  });

  it('owes the unpaid days, from the oldest', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000), day('2026-11-02', 2_000_000), day('2026-11-03', 3e6)],
      payments: [payment('p1', 1_500_000, '2026-11-04T10:00:00Z')],
    });
    expect(account.paidThrough).toBe('2026-11-01');
    expect(account.owes).toEqual({ amount: 4_500_000, days: 2, oldest: '2026-11-02' });
  });

  it('ignores a donation from before the book, but not a hand-recorded payment', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [
        payment('early', 1_000_000, '2026-10-30T10:00:00Z'),
        payment('hand', 400_000, '2026-10-30T11:00:00Z', { source: 'manual' }),
      ],
      startDate: '2026-11-01',
    });
    expect(account.owes?.amount).toBe(600_000);
  });

  it('lists the dates still owed oldest first, leaving out a day a dispute holds', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-03', 3e6), day('2026-11-01', 1e6), day('2026-11-02', 2e6)],
      payments: [],
      heldDays: new Set(['2026-11-02']),
    });
    expect(account.owedDates()).toEqual(['2026-11-01', '2026-11-03']);
    expect(account.day('2026-11-02')?.held).toBe(true);
    expect(account.day('2026-11-09')).toBeUndefined();
  });

  it('reads a late notice’s standing off its days', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 2e6)],
      payments: [payment('p1', 1e6, '2026-11-03T10:00:00Z')],
    });
    const notice = {
      lines: [
        { date: '2026-11-01', key: 'c1', tax: 1e6 },
        { date: '2026-11-02', key: 'c2', tax: 2e6 },
      ],
    };
    expect(account.standingOf(notice)).toMatchObject({ due: 3e6, remaining: 2e6, settled: false });
  });

  it('forgives with every write-off, oldest day first: a late notice is no bill to pin one to', () => {
    // The legacy pass dropped a write-off naming a notice; decision 20261120-235011.
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 1e6)],
      payments: [],
      writeOffs: [{ id: 'w1', amount: 1e6 }],
    });
    expect(account.owes).toEqual({ amount: 1e6, days: 1, oldest: '2026-11-02' });
  });

  it('applies officer write-offs after every payment, and drops what they find nothing to forgive', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000), day('2026-11-02', 1_000_000)],
      payments: [payment('p1', 1_000_000, '2026-11-03T10:00:00Z')],
      writeOffs: [{ id: 'w1', amount: 5_000_000 }],
    });
    expect(account.applications.writeOffs).toEqual([{ date: '2026-11-02', amount: 1_000_000 }]);
    expect(account.owes).toBeNull();
    expect(account.credit).toBe(0);
  });
});

/** A small deterministic generator, so a failure names the seed that made it. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
}

function randomInput(seed: number): MinerRunningAccountInput {
  const r = rng(seed);
  const date = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  const days = Array.from({ length: r.int(0, 8) }, (): RunningDay => {
    const tax = r.pick([-500_000, 0, 90_000, 1_000_000, 2_345_678, 10_000_000]);
    // An officer's charge on the day (a positive correction line), which a recorded-paid day keeps owed.
    const charge = tax > 0 && r.next() < 0.3 ? r.pick([50_000, tax]) : undefined;
    return { ...day(date(r.int(1, 20)), tax), ...(charge !== undefined ? { charge } : {}) };
  });
  const payments = Array.from({ length: r.int(0, 5) }, (_, i) =>
    payment(
      `p${i}`,
      r.pick([0, 1, 45_000, 999_000, 1_000_000, 3_000_000, 20_000_000]),
      `${date(r.int(1, 25))}T0${i}:00:00Z`,
      {
        source: r.pick(['donation', 'manual'] as const),
        // A code pins a donation to a mailed notice; with no Statement to settle it pays days alike.
        ...(r.next() < 0.3 ? { statementId: 'notice_x' } : {}),
        ...(r.next() < 0.3 ? { notTaxAmount: r.pick([1, 500_000, 50_000_000]) } : {}),
      }
    )
  );
  const writeOffs = Array.from({ length: r.int(0, 2) }, (_, i) => ({
    id: `w${i}`,
    amount: r.pick([1_000, 500_000, 4_000_000]),
  }));
  const dates = [...new Set(days.map((d) => d.date))];
  return {
    days,
    payments,
    writeOffs,
    ...(r.next() < 0.5 ? { startDate: date(r.int(1, 10)) } : {}),
    ...(r.next() < 0.3 && dates.length > 0
      ? { heldDays: new Set(dates.filter(() => r.next() < 0.5)) }
      : {}),
    // Any date: on a day, between days, before or after them all.
    ...(r.next() < 0.3 ? { storedPaidThrough: date(r.int(1, 22)) } : {}),
    ...(r.next() < 0.3 ? { dayTolerancePct: r.pick([0, 0.5, 2]) } : {}),
    ...(r.next() < 0.2 && dates.length > 0
      ? { toleranceExemptions: new Map([[r.pick(dates), r.pick([0, 10_000])]]) }
      : {}),
  };
}

describe('MinerRunningAccount.build is wired as allocateRunningAccount with no Statements', () => {
  // Both run the same day-settling core (`settleDays`); this pins the money each feeds it. Production
  // holds no calendar Statement, so the legacy pass in `allocateRunningAccount` must find nothing.
  it('on 500 random books with no Statements', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const input = randomInput(seed);
      const before = allocateRunningAccount({
        ...input,
        statements: [],
        dismissalCredits: [],
        officerWriteOffs: input.writeOffs?.map((w) => ({ ...w, at: '2026-11-01T00:00:00Z' })),
      });
      const after = MinerRunningAccount.build(input);
      const context = `seed ${seed}`;
      expect(after.byDay, context).toEqual(before.byDay);
      expect(after.credit, context).toBeCloseTo(before.credit, 6);
      expect(after.balance, context).toBeCloseTo(before.balance, 6);
      expect(after.paidThrough, context).toBe(before.paidThrough);
      expect(after.owes, context).toEqual(before.owes);
      expect(after.applications.corrections, context).toEqual(before.applications.corrections);
      expect(after.applications.writeOffs, context).toEqual(before.applications.writeOffs);
      expect(after.applications.payments, context).toEqual(
        before.applications.payments.map(({ paymentId, days, credit }) => ({
          paymentId,
          days,
          credit,
        }))
      );
    }
  });
});
