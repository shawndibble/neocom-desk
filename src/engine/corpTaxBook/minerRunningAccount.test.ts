import { describe, it, expect } from 'vitest';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
  type RunningDay,
} from './minerRunningAccount';
import type { RunningAccountCheckpoint } from '../../../functions/src/corpTaxBookCheckpoint';
import type { TaxPayment } from './payments';

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
      writeOffs: [{ id: 'w1', amount: 1e6, at: '2026-11-03T00:00:00Z' }],
    });
    expect(account.owes).toEqual({ amount: 1e6, days: 1, oldest: '2026-11-02' });
  });

  it('applies officer write-offs after every payment, and drops what they find nothing to forgive', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000), day('2026-11-02', 1_000_000)],
      payments: [payment('p1', 1_000_000, '2026-11-03T10:00:00Z')],
      writeOffs: [{ id: 'w1', amount: 5_000_000, at: '2026-11-03T00:00:00Z' }],
    });
    expect(account.applications.writeOffs).toEqual([{ date: '2026-11-02', amount: 1_000_000 }]);
    expect(account.owes).toBeNull();
    expect(account.credit).toBe(0);
  });
});

const checkpoint = (over: Partial<RunningAccountCheckpoint> = {}): RunningAccountCheckpoint => ({
  minerId: 'm1',
  through: '2026-10-31',
  owed: [],
  credit: 0,
  balance: 0,
  paidThrough: '2026-10-31',
  at: '2026-12-02T00:00:00Z',
  ...over,
});

describe('MinerRunningAccount.build from a closed-through checkpoint', () => {
  it('never bills again a day on or before the checkpoint', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-10-15', 5e6), day('2026-11-02', 1e6)],
      payments: [],
      checkpoint: checkpoint(),
    });
    expect(account.day('2026-10-15')).toBeUndefined();
    expect(account.owes).toEqual({ amount: 1e6, days: 1, oldest: '2026-11-02' });
  });

  it('still owes the checkpoint’s owed days, oldest first', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [payment('p1', 600_000, '2026-11-05T10:00:00Z')],
      checkpoint: checkpoint({
        owed: [{ date: '2026-10-20', remaining: 500_000 }],
        balance: 500_000,
        paidThrough: '2026-10-19',
      }),
    });
    expect(account.day('2026-10-20')?.settled).toBe(true);
    expect(account.day('2026-11-02')?.remaining).toBe(900_000);
    expect(account.owes).toEqual({ amount: 900_000, days: 1, oldest: '2026-11-02' });
    expect(account.paidThrough).toBe('2026-10-31');
  });

  it('opens at the checkpoint’s balance', () => {
    const account = MinerRunningAccount.build({
      days: [],
      payments: [],
      checkpoint: checkpoint({
        owed: [{ date: '2026-10-20', remaining: 500_000 }],
        balance: 500_000,
        paidThrough: '2026-10-19',
      }),
    });
    expect(account.balance).toBe(500_000);
    expect(account.owes).toEqual({ amount: 500_000, days: 1, oldest: '2026-10-20' });
    expect(account.paidThrough).toBe('2026-10-19');
  });

  it('carries the checkpoint’s credit forward to the next days', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [],
      checkpoint: checkpoint({ credit: 2e6, balance: -2e6 }),
    });
    expect(account.day('2026-11-02')?.settled).toBe(true);
    expect(account.credit).toBe(1e6);
    expect(account.balance).toBe(-1e6);
    expect(account.paidThrough).toBe('2026-11-02');
    expect(account.applications.payments).toEqual([]);
  });

  it('counts only money dated after the checkpoint: the rest is in it', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [payment('old', 3e6, '2026-10-25T10:00:00Z')],
      writeOffs: [{ id: 'w-old', amount: 1e6, at: '2026-10-26T00:00:00Z' }],
      checkpoint: checkpoint(),
    });
    expect(account.owes?.amount).toBe(1e6);
  });

  it('forgives the checkpoint’s owed days first with a later write-off', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [],
      writeOffs: [{ id: 'w1', amount: 500_000, at: '2026-11-10T00:00:00Z' }],
      checkpoint: checkpoint({
        owed: [{ date: '2026-10-20', remaining: 500_000 }],
        balance: 500_000,
        paidThrough: '2026-10-19',
      }),
    });
    expect(account.applications.writeOffs).toEqual([{ date: '2026-10-20', amount: 500_000 }]);
    expect(account.owes).toEqual({ amount: 1e6, days: 1, oldest: '2026-11-02' });
  });
});

describe('MinerRunningAccount.checkpoint', () => {
  const input: MinerRunningAccountInput = {
    days: [day('2026-10-01', 1e6), day('2026-10-02', 2e6), day('2026-11-02', 1e6)],
    payments: [
      payment('p1', 1_500_000, '2026-10-10T10:00:00Z'),
      payment('p2', 5e6, '2026-11-05T10:00:00Z'),
    ],
  };

  it('sums up the days and money through a date, ignoring what came later', () => {
    expect(
      MinerRunningAccount.checkpoint(input, 'm1', '2026-10-31', { at: '2026-12-02T00:00:00Z' })
    ).toEqual({
      minerId: 'm1',
      through: '2026-10-31',
      owed: [{ date: '2026-10-02', remaining: 1_500_000 }],
      credit: 0,
      balance: 1_500_000,
      paidThrough: '2026-10-01',
      at: '2026-12-02T00:00:00Z',
    });
  });

  it('is paid through its date once nothing is owed, and keeps who recorded it', () => {
    const paid = { ...input, payments: [payment('p1', 4e6, '2026-10-10T10:00:00Z')] };
    expect(
      MinerRunningAccount.checkpoint(paid, 'm1', '2026-10-31', { at: 'x', by: 7 })
    ).toMatchObject({ owed: [], credit: 1e6, balance: -1e6, paidThrough: '2026-10-31', by: 7 });
  });

  it('keeps an officer’s charge on a day still owed', () => {
    const charged = { days: [{ date: '2026-10-02', tax: 3e6, charge: 1e6 }], payments: [] };
    expect(MinerRunningAccount.checkpoint(charged, 'm1', '2026-10-31', { at: 'x' }).owed).toEqual([
      { date: '2026-10-02', remaining: 3e6, charge: 1e6 },
    ]);
  });

  it('rolls forward from the previous checkpoint', () => {
    const first = MinerRunningAccount.checkpoint(input, 'm1', '2026-10-31', { at: 'x' });
    const chained = MinerRunningAccount.checkpoint(
      { ...input, checkpoint: first },
      'm1',
      '2026-11-30',
      { at: 'x' }
    );
    expect(chained).toEqual(MinerRunningAccount.checkpoint(input, 'm1', '2026-11-30', { at: 'x' }));
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

/**
 * A book whose closed days do not change after they close, as ESI's ledgers guarantee: days and
 * money either side of `through`, some days held by a dispute, a mined day on `through` itself.
 */
function randomBook(seed: number): { input: MinerRunningAccountInput; through: string } {
  const r = rng(seed);
  const date = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  const cut = r.int(3, 15);
  const days = [
    day(date(cut), r.pick([90_000, 1_000_000])),
    ...Array.from({ length: r.int(0, 10) }, () =>
      day(date(r.int(1, 25)), r.pick([0, 90_000, 1_000_000, 2_345_678, 10_000_000]))
    ),
  ];
  const payments = Array.from({ length: r.int(0, 6) }, (_, i) =>
    payment(
      `p${i}`,
      r.pick([0, 1, 45_000, 999_000, 1_000_000, 3_000_000, 20_000_000]),
      `${date(r.int(1, 28))}T0${i}:00:00Z`,
      {
        source: r.pick(['donation', 'manual'] as const),
        ...(r.next() < 0.3 ? { notTaxAmount: r.pick([1, 500_000, 50_000_000]) } : {}),
      }
    )
  );
  const dates = [...new Set(days.map((d) => d.date))];
  return {
    through: date(cut),
    input: {
      days,
      payments,
      ...(r.next() < 0.5 ? { startDate: date(r.int(1, 10)) } : {}),
      // The day on `through` is not held, so "paid through" names it whichever way it is built.
      ...(r.next() < 0.3
        ? { heldDays: new Set(dates.filter((d) => d !== date(cut) && r.next() < 0.3)) }
        : {}),
      dayTolerancePct: 0,
    },
  };
}

describe('a checkpoint plus the later days is the whole history', () => {
  it('on 500 random books', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const { input, through } = randomBook(seed);
      const whole = MinerRunningAccount.build(input);
      const cp = MinerRunningAccount.checkpoint(input, 'm1', through, { at: 'x' });
      const resumed = MinerRunningAccount.build({ ...input, checkpoint: cp });
      const context = `seed ${seed}`;
      expect(resumed.credit, context).toBeCloseTo(whole.credit, 6);
      expect(resumed.balance, context).toBeCloseTo(whole.balance, 6);
      expect(resumed.paidThrough, context).toBe(whole.paidThrough);
      expect(resumed.owes?.days, context).toBe(whole.owes?.days);
      expect(resumed.owes?.oldest, context).toBe(whole.owes?.oldest);
      expect(resumed.owes?.amount ?? 0, context).toBeCloseTo(whole.owes?.amount ?? 0, 6);
      expect(resumed.owedDates(), context).toEqual(whole.owedDates());
      for (const [date, d] of resumed.byDay) {
        const w = whole.day(date)!;
        expect([date, d.settled, d.held], context).toEqual([date, w.settled, w.held]);
        expect(d.remaining, `${context} ${date}`).toBeCloseTo(w.remaining, 6);
      }
    }
  });
});
