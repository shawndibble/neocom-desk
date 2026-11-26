import { describe, it, expect } from 'vitest';
import {
  MinerRunningAccount,
  type MinerRunningAccountInput,
  type RunningDay,
} from './minerRunningAccount';
import {
  checkpointProblems,
  type RunningAccountCheckpoint,
} from '../../../functions/src/corpTaxBookCheckpoint';
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

describe('MinerRunningAccount.build: a dispute on a day recorded paid (M4)', () => {
  it('does not hold the day: it stays paid, keeps its money, and the balance counts it', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 1e6)],
      payments: [payment('p1', 2e6, '2026-11-03T10:00:00Z')],
      storedPaidThrough: '2026-11-01',
      heldDays: new Set(['2026-11-01']),
    });
    expect(account.day('2026-11-01')).toMatchObject({ held: false, settled: true, credited: 1e6 });
    expect(account.credit).toBe(0);
    expect(account.balance).toBe(0);
    expect(account.owes).toBeNull();
  });

  it('still holds a disputed day not recorded paid', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 1e6)],
      payments: [payment('p1', 1e6, '2026-11-03T10:00:00Z')],
      heldDays: new Set(['2026-11-01']),
    });
    expect(account.day('2026-11-01')).toMatchObject({ held: true, settled: false });
    expect(account.day('2026-11-02')?.settled).toBe(true);
  });
});

describe('MinerRunningAccount.build: exemptions and officer charges', () => {
  it('lets no exemption reopen a day recorded paid', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 1e6)],
      payments: [payment('p1', 1e6, '2026-11-03T10:00:00Z')],
      storedPaidThrough: '2026-11-01',
      toleranceExemptions: new Map([['2026-11-01', 0]]),
    });
    expect(account.day('2026-11-01')?.settled).toBe(true);
    expect(account.paidThrough).toBe('2026-11-01');
    expect(account.owes).toEqual({ amount: 1e6, days: 1, oldest: '2026-11-02' });
  });

  it('counts an officer charge on a day recorded paid once, even with an exemption on it', () => {
    const account = MinerRunningAccount.build({
      days: [
        { date: '2026-11-01', tax: 1_100_000, charge: 100_000 },
        { date: '2026-11-02', tax: 1_100_000, charge: 100_000 },
      ],
      payments: [],
      storedPaidThrough: '2026-11-02',
      toleranceExemptions: new Map([['2026-11-01', 0]]),
    });
    expect(account.owes?.amount).toBe(200_000);
  });

  it('never lets the tolerance forgive an officer charge, however small', () => {
    const account = MinerRunningAccount.build({
      days: [{ date: '2026-11-01', tax: 1_003_000, charge: 3_000 }],
      payments: [payment('p1', 1e6, '2026-11-03T10:00:00Z')],
    });
    expect(account.owes?.amount).toBe(3_000);
    const short = MinerRunningAccount.build({
      days: [{ date: '2026-11-01', tax: 1_003_000, charge: 3_000 }],
      payments: [payment('p1', 1_002_000, '2026-11-03T10:00:00Z')],
    });
    expect(short.owes?.amount).toBe(1_000);
    const plain = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6)],
      payments: [payment('p1', 997_000, '2026-11-03T10:00:00Z')],
    });
    expect(plain.owes).toBeNull();
  });
});

describe('MinerRunningAccount.build: float residue (M6)', () => {
  it('treats under half an ISK left as done, so no day reads "owes 0 ISK"', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000.3), day('2026-11-01', -1_000), day('2026-11-02', 2_000)],
      payments: [payment('p1', 1_999.6, '2026-11-03T10:00:00Z')],
      dayTolerancePct: 0,
    });
    expect(account.byDay.get('2026-11-01')?.settled).toBe(true);
    expect(account.byDay.get('2026-11-02')?.settled).toBe(true);
    expect(account.owes).toBeNull();
    expect(account.paidThrough).toBe('2026-11-02');
  });

  it('still owes a day half an ISK or more short', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 2_000)],
      payments: [payment('p1', 1_999.5, '2026-11-03T10:00:00Z')],
      dayTolerancePct: 0,
    });
    expect(account.owes).toEqual({ amount: 0.5, days: 1, oldest: '2026-11-02' });
  });
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

  it('keeps closableThrough moving past the days the checkpoint closed (M2)', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-10-05', 1e6), day('2026-11-02', 1e6)],
      payments: [payment('p1', 1e6, '2026-11-05T10:00:00Z')],
      checkpoint: checkpoint(),
    });
    expect(account.closableThrough('2026-11-21')).toBe('2026-11-02');
    const owing = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [payment('p1', 1e6, '2026-11-05T10:00:00Z')],
      checkpoint: checkpoint({
        owed: [{ date: '2026-10-05', remaining: 1e6 }],
        balance: 1e6,
        paidThrough: '2026-10-04',
      }),
    });
    expect(owing.closableThrough('2026-11-21')).toBe('2026-10-05');
  });

  it('pours each write-off, in the order recorded, into the days it forgave', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1e6), day('2026-11-02', 1e6)],
      payments: [],
      writeOffs: [
        { id: 'w2', amount: 1_000_000, at: '2026-11-05T00:00:00Z' },
        { id: 'w1', amount: 400_000, at: '2026-11-03T00:00:00Z' },
      ],
    });
    expect([...account.writeOffDays()]).toEqual([
      ['w1', [{ date: '2026-11-01', amount: 400_000 }]],
      [
        'w2',
        [
          { date: '2026-11-01', amount: 600_000 },
          { date: '2026-11-02', amount: 400_000 },
        ],
      ],
    ]);
  });

  it('pours no write-off the checkpoint already holds into a day after it', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [],
      writeOffs: [
        { id: 'w-old', amount: 1e6, at: '2026-10-26T00:00:00Z' },
        { id: 'w-new', amount: 100_000, at: '2026-11-10T00:00:00Z' },
      ],
      checkpoint: checkpoint(),
    });
    expect([...account.writeOffDays()]).toEqual([
      ['w-new', [{ date: '2026-11-02', amount: 100_000 }]],
    ]);
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

describe('MinerRunningAccount.build: a snapshot’s held day follows the live dispute', () => {
  const snapshot = checkpoint({
    owed: [{ date: '2026-10-20', remaining: 500_000, tax: 500_000, credited: 0, held: true }],
  });
  const build = (over: Partial<MinerRunningAccountInput> = {}) =>
    MinerRunningAccount.build({
      days: [day('2026-11-02', 1e6)],
      payments: [payment('p1', 600_000, '2026-11-05T10:00:00Z')],
      checkpoint: snapshot,
      ...over,
    });

  it('stays held while the dispute is open: no money, and out of the balance', () => {
    const account = build({ heldDays: new Set(['2026-10-20']) });
    expect(account.day('2026-10-20')).toMatchObject({ held: true, credited: 0 });
    expect(account.balance).toBe(400_000);
    expect(account.owes).toEqual({ amount: 400_000, days: 1, oldest: '2026-11-02' });
  });

  it('is owed again once the dispute is rejected or withdrawn, and paid oldest first', () => {
    const account = build();
    expect(account.day('2026-10-20')).toMatchObject({ held: false, settled: true });
    expect(account.day('2026-11-02')?.remaining).toBe(900_000);
    expect(account.balance).toBe(900_000);
    expect(account.paidThrough).toBe('2026-10-31');
    const unpaid = build({ payments: [] });
    expect(unpaid.owes).toEqual({ amount: 1.5e6, days: 2, oldest: '2026-10-20' });
    expect(unpaid.paidThrough).toBe('2026-10-19');
  });

  it('is waived once officers dismiss the dispute: by what the dismissal credited', () => {
    const account = build({ disputeWaivers: new Map([['2026-10-20', 500_000]]) });
    expect(account.day('2026-10-20')).toMatchObject({ held: false, settled: true });
    expect(account.day('2026-11-02')?.remaining).toBe(400_000);
    expect(account.balance).toBe(400_000);
    expect(account.paidThrough).toBe('2026-10-31');
    const part = build({ payments: [], disputeWaivers: new Map([['2026-10-20', 200_000]]) });
    expect(part.day('2026-10-20')?.remaining).toBe(300_000);
    expect(part.balance).toBe(1.3e6);
  });

  it('carries a day the snapshot did not hold unchanged: a live hold or waiver does not reach it', () => {
    const account = build({
      payments: [],
      heldDays: new Set(['2026-10-20']),
      disputeWaivers: new Map([['2026-10-20', 500_000]]),
      checkpoint: checkpoint({
        owed: [{ date: '2026-10-20', remaining: 500_000, tax: 500_000, credited: 0 }],
        balance: 500_000,
        paidThrough: '2026-10-19',
      }),
    });
    expect(account.day('2026-10-20')).toMatchObject({ held: false, remaining: 500_000 });
    expect(account.balance).toBe(1.5e6);
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
      owed: [{ date: '2026-10-02', remaining: 1_500_000, tax: 2e6, credited: 500_000 }],
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
      { date: '2026-10-02', remaining: 3e6, charge: 1e6, tax: 3e6, credited: 0 },
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

function harderBook(seed: number): { input: MinerRunningAccountInput; through: string } {
  const r = rng(seed * 7919);
  const base = randomBook(seed);
  const date = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
  const days = [
    ...base.input.days,
    ...Array.from({ length: r.int(0, 3) }, () => ({
      date: date(r.int(1, 25)),
      tax: r.pick([250_000, 1_000_000]),
      charge: r.pick([100_000, 250_000]),
    })),
    ...(r.next() < 0.3 ? [day(date(r.int(1, 25)), -r.pick([50_000, 1_000_000]))] : []),
  ];
  const dates = [...new Set(days.map((d) => d.date))];
  return {
    through: base.through,
    input: {
      ...base.input,
      days,
      ...(r.next() < 0.5 ? { storedPaidThrough: date(r.int(1, 20)) } : {}),
      heldDays: new Set(dates.filter(() => r.next() < 0.25)),
      ...(r.next() < 0.4
        ? {
            writeOffs: [
              {
                id: 'w1',
                amount: r.pick([10_000, 2_000_000]),
                at: `${date(r.int(1, 25))}T05:00:00Z`,
              },
            ],
          }
        : {}),
      dayTolerancePct: r.pick([0, 0.5]),
    },
  };
}

describe('a checkpoint always passes the shared checkpointProblems (M5)', () => {
  it('on 500 random books with held days, officer charges and recorded-paid days', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const { input, through } = harderBook(seed);
      const cp = MinerRunningAccount.checkpoint(input, 'm1', through, { at: 'x' });
      expect(checkpointProblems(cp), `seed ${seed}: ${JSON.stringify(cp)}`).toEqual([]);
    }
  });
});

describe('a checkpoint plus the later days is the whole history, at the tolerance edge (M1)', () => {
  it('settles a 100M day paid 60M before the checkpoint and 39.7M after, as the whole history does', () => {
    const input: MinerRunningAccountInput = {
      days: [day('2026-10-10', 100e6)],
      payments: [
        payment('a', 60e6, '2026-10-20T00:00:00Z'),
        payment('b', 39.7e6, '2026-11-05T00:00:00Z'),
      ],
    };
    const whole = MinerRunningAccount.build(input);
    expect(whole.owes).toBeNull();
    const cp = MinerRunningAccount.checkpoint(input, 'm1', '2026-10-31', { at: 'x' });
    expect(cp.owed).toEqual([{ date: '2026-10-10', remaining: 40e6, tax: 100e6, credited: 60e6 }]);
    const resumed = MinerRunningAccount.build({ ...input, checkpoint: cp });
    expect(resumed.owes).toBeNull();
    expect(resumed.day('2026-10-10')).toMatchObject({ tax: 100e6, settled: true });
    expect(resumed.balance).toBeCloseTo(whole.balance, 6);
  });

  it('on 500 random books with the book tolerance', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const { input, through } = randomBook(seed);
      const tolerant = { ...input, dayTolerancePct: 0.5 };
      const whole = MinerRunningAccount.build(tolerant);
      const cp = MinerRunningAccount.checkpoint(tolerant, 'm1', through, { at: 'x' });
      expect(checkpointProblems(cp), `seed ${seed}`).toEqual([]);
      const resumed = MinerRunningAccount.build({ ...tolerant, checkpoint: cp });
      const context = `seed ${seed}`;
      expect(resumed.paidThrough, context).toBe(whole.paidThrough);
      const before = MinerRunningAccount.build({
        ...tolerant,
        days: tolerant.days.filter((d) => d.date <= through),
        payments: tolerant.payments.filter((p) => p.at.slice(0, 10) <= through),
      });
      const forgiven = [...before.byDay.values()].reduce((sum, d) => sum + d.writtenOff, 0);
      expect(Math.abs(resumed.credit - whole.credit), context).toBeLessThanOrEqual(forgiven + 1e-6);
      const owed = (x: MinerRunningAccount) => x.owes?.amount ?? 0;
      expect(Math.abs(owed(resumed) - owed(whole)), context).toBeLessThanOrEqual(forgiven + 1e-6);
    }
  });
});

describe('MinerRunningAccount: what screens read off it (D1)', () => {
  const account = MinerRunningAccount.build({
    days: [
      day('2026-11-01', 1e6),
      day('2026-11-02', 1e6),
      day('2026-11-03', 2e6),
      day('2026-11-04', 1e6),
    ],
    payments: [payment('p1', 1_995_000, '2026-11-05T10:00:00Z')],
    heldDays: new Set(['2026-11-04']),
  });

  it('lists the days still owed with their whole tax, none held or settled', () => {
    expect(account.owedDays()).toEqual([{ date: '2026-11-03', owed: 2e6, tax: 2e6 }]);
  });

  it('lists the dates an open dispute holds', () => {
    expect(account.heldDates()).toEqual(['2026-11-04']);
  });

  it('lists what the tolerance wrote off, by day, dated by the payment that closed it', () => {
    expect(account.writtenOffDays([{ id: 'p1', at: '2026-11-05T10:00:00Z' }])).toEqual([
      { date: '2026-11-02', amount: 5_000, at: '2026-11-05T10:00:00Z', paymentId: 'p1' },
    ]);
    expect(account.writtenOffDays([])).toEqual([
      { date: '2026-11-02', amount: 5_000, at: '2026-11-02' },
    ]);
  });

  it('closes through the newest settled, saved-priced day before today', () => {
    const priced = MinerRunningAccount.build({
      days: [
        { date: '2026-11-01', tax: 1e6, savedPrice: true },
        { date: '2026-11-02', tax: 1e6, savedPrice: false },
      ],
      payments: [payment('p1', 2e6, '2026-11-05T10:00:00Z')],
    });
    expect(priced.closableThrough('2026-11-21')).toBe('2026-11-01');
  });
});

describe('MinerRunningAccount tolerance close-outs', () => {
  it('names each day a payment closed within the tolerance, with only the money paid and the limit used', () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 996_000, '2026-11-02T10:00:00Z')],
    });
    expect([...account.toleranceCloseOuts]).toEqual([
      ['2026-11-01', { billed: 1_000_000, paid: 996_000, writtenOff: 4_000, limit: 5_000 }],
    ]);
  });

  it("uses the day's exemption as its limit", () => {
    const account = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 980_000, '2026-11-02T10:00:00Z')],
      toleranceExemptions: new Map([['2026-11-01', 25_000]]),
    });
    expect(account.toleranceCloseOuts.get('2026-11-01')).toMatchObject({
      limit: 25_000,
      writtenOff: 20_000,
      exempt: true,
    });
  });

  it('leaves out a day closed by the stored Paid through, one paid in full, and one short beyond the tolerance', () => {
    const pinned = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 999_000, '2026-11-02T10:00:00Z')],
      storedPaidThrough: '2026-11-01',
    });
    expect(pinned.byDay.get('2026-11-01')?.writtenOff).toBe(1_000);
    expect(pinned.toleranceCloseOuts.size).toBe(0);
    const full = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 1_000_000, '2026-11-02T10:00:00Z')],
    });
    expect(full.toleranceCloseOuts.size).toBe(0);
    const short = MinerRunningAccount.build({
      days: [day('2026-11-01', 1_000_000)],
      payments: [payment('p1', 990_000, '2026-11-02T10:00:00Z')],
    });
    expect(short.toleranceCloseOuts.size).toBe(0);
  });
});

describe('MinerRunningAccount.moneyAppliedOn', () => {
  const pay = (amount: number): TaxPayment => ({
    id: 'p1',
    minerId: 'm1',
    characterId: 1,
    amount,
    at: '2026-11-03T10:00:00Z',
    source: 'donation',
  });
  const days = [
    { date: '2026-11-01', tax: 1_000 },
    { date: '2026-11-02', tax: 1_000 },
  ];

  it('is true for a day a payment reached and false for one it did not', () => {
    const account = MinerRunningAccount.build({ days, payments: [pay(500)] });
    expect(account.moneyAppliedOn('2026-11-01')).toBe(true);
    expect(account.moneyAppliedOn('2026-11-02')).toBe(false);
  });

  it('counts a stored Paid through as paid, but not an officer write-off', () => {
    expect(
      MinerRunningAccount.build({
        days,
        payments: [],
        storedPaidThrough: '2026-11-01',
      }).moneyAppliedOn('2026-11-01')
    ).toBe(true);
    expect(
      MinerRunningAccount.build({
        days,
        payments: [],
        writeOffs: [{ id: 'w1', amount: 1_000, at: '2026-11-03T00:00:00Z' }],
      }).moneyAppliedOn('2026-11-01')
    ).toBe(false);
  });
});
