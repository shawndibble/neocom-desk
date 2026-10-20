import { describe, expect, it } from 'vitest';
import {
  accrueFeeder,
  feederBalance,
  onPayList,
  type FeederAccrualInput,
  type FeederPayout,
} from './feederAccrual';
import type { ObservedMiningEntry } from './types';

const FEEDER = 98000001;

function entry(date: string, qty: number, source: number | null = FEEDER) {
  return {
    characterId: 1,
    recordedCorporationId: 1,
    structureId: 10,
    date,
    ...(source !== null ? { sourceCorporationId: source } : {}),
    oreLines: [{ typeId: 100, quantity: qty }],
  } as unknown as ObservedMiningEntry;
}

/** Every ore unit is worth 1 ISK, so a day's value is its quantity. */
const pricesOn = () => new Map<number, number>([[100, 1]]);

function input(over: Partial<FeederAccrualInput> = {}): FeederAccrualInput {
  return {
    feederCorporationId: FEEDER,
    entries: [],
    coveragePeriods: [{ from: '2026-06-01' }],
    ownerRateHistory: [
      { kind: 'agreed', pct: 10, effectiveFrom: '2026-06-01', recordedAt: '2026-06-01T00:00:00Z' },
    ],
    modeChanges: [],
    isBillable: () => true,
    pricesOn,
    ...over,
  };
}

const payout = (amount: number, over: Partial<FeederPayout> = {}): FeederPayout => ({
  date: '2026-06-10',
  amount,
  method: 'donation',
  status: 'recorded',
  notAPayout: false,
  ...over,
});

describe('accrueFeeder', () => {
  it('owes the owner rate times the ore value at the feeder refineries', () => {
    const r = accrueFeeder(input({ entries: [entry('2026-06-05', 1000)] }));
    expect(r.accrued).toBe(100);
    expect(r.byDay).toEqual([{ date: '2026-06-05', value: 1000, pct: 10, due: 100 }]);
  });

  it('ignores ore recorded at other refineries', () => {
    const r = accrueFeeder(
      input({ entries: [entry('2026-06-05', 1000, 98000002), entry('2026-06-05', 500, null)] })
    );
    expect(r.accrued).toBe(0);
  });

  it('includes both inclusive coverage boundaries and nothing outside', () => {
    const r = accrueFeeder(
      input({
        coveragePeriods: [{ from: '2026-06-10', to: '2026-06-12' }],
        entries: ['09', '10', '12', '13'].map((d) => entry(`2026-06-${d}`, 100)),
      })
    );
    expect(r.byDay.map((d) => d.date)).toEqual(['2026-06-10', '2026-06-12']);
  });

  it('accrues only on Billable days', () => {
    const r = accrueFeeder(
      input({
        entries: [entry('2026-06-05', 100), entry('2026-06-06', 100)],
        isBillable: (day) => day <= '2026-06-05',
      })
    );
    expect(r.byDay.map((d) => d.date)).toEqual(['2026-06-05']);
  });

  it('sums several entries of one day', () => {
    const r = accrueFeeder(
      input({ entries: [entry('2026-06-05', 100), entry('2026-06-05', 300)] })
    );
    expect(r.byDay).toEqual([{ date: '2026-06-05', value: 400, pct: 10, due: 40 }]);
  });

  it('applies an owner-rate change from its effective date, never back', () => {
    const r = accrueFeeder(
      input({
        ownerRateHistory: [
          { kind: 'agreed', pct: 10, effectiveFrom: '2026-06-01', recordedAt: 'a' },
          { kind: 'agreed', pct: 20, effectiveFrom: '2026-06-06', recordedAt: 'b' },
        ],
        entries: [entry('2026-06-05', 1000), entry('2026-06-06', 1000)],
      })
    );
    expect(r.byDay.map((d) => d.due)).toEqual([100, 200]);
  });

  it('owes nothing with no rate, and a rate set later accrues forward only', () => {
    const entries = [entry('2026-06-05', 1000), entry('2026-06-08', 1000)];
    expect(accrueFeeder(input({ ownerRateHistory: [], entries })).accrued).toBe(0);
    const later = accrueFeeder(
      input({
        ownerRateHistory: [
          { kind: 'agreed', pct: 10, effectiveFrom: '2026-06-08', recordedAt: 'a' },
        ],
        entries,
      })
    );
    expect(later.byDay.map((d) => d.date)).toEqual(['2026-06-08']);
    expect(later.accrued).toBe(100);
  });

  it('settled otherwise owes nothing; switching off resumes from the switch day, not backfilled', () => {
    const entries = ['04', '05', '06', '07'].map((d) => entry(`2026-06-${d}`, 1000));
    const r = accrueFeeder(
      input({
        entries,
        modeChanges: [
          { from: '2026-06-05', mode: 'settled-otherwise' },
          { from: '2026-06-07', mode: 'normal' },
        ],
      })
    );
    expect(r.byDay.map((d) => d.date)).toEqual(['2026-06-04', '2026-06-07']);
  });

  it('does not round per day', () => {
    const r = accrueFeeder(input({ entries: [entry('2026-06-05', 15), entry('2026-06-06', 15)] }));
    expect(r.accrued).toBe(3);
    expect(r.byDay.map((d) => d.due)).toEqual([1.5, 1.5]);
  });
});

describe('feederBalance', () => {
  it('is accrued minus payouts received', () => {
    const b = feederBalance(1000, [payout(300), payout(200)]);
    expect(b.balance).toBe(500);
    expect(b.display).toEqual({ kind: 'owed', isk: 500 });
  });

  it('shows an overpayment as credit that a later accrual absorbs', () => {
    const over = feederBalance(100, [payout(250)]);
    expect(over.balance).toBe(-150);
    expect(over.display).toEqual({ kind: 'credit', isk: 150 });
    expect(feederBalance(100 + 200, [payout(250)]).display).toEqual({ kind: 'owed', isk: 50 });
  });

  it('rounds the balance down for display only, credit toward zero', () => {
    const owed = feederBalance(1000.9, [payout(0.3)]);
    expect(owed.balance).toBeCloseTo(1000.6);
    expect(owed.display).toEqual({ kind: 'owed', isk: 1000 });
    expect(feederBalance(0, [payout(10.9)]).display).toEqual({ kind: 'credit', isk: 10 });
  });

  it('is even when nothing is owed', () => {
    expect(feederBalance(0.4, []).display).toEqual({ kind: 'even', isk: 0 });
  });

  it('ignores payouts flagged "not a payout", and counts unmatched ones at once', () => {
    const b = feederBalance(1000, [
      payout(400, { notAPayout: true }),
      payout(100, { status: 'waiting-for-journal' }),
      payout(100, { status: 'matched', journalRef: 7 }),
    ]);
    expect(b.balance).toBe(800);
  });
});

describe('settled otherwise', () => {
  it('keeps no balance, however much was accrued, and is never on the pay list', () => {
    const b = feederBalance(500, [payout(100)], true);
    expect(b).toEqual({ balance: 0, display: { kind: 'none', isk: 0 } });
    expect(onPayList(b)).toBe(false);
  });
});

describe('onPayList', () => {
  it('lists a feeder owed at least one whole ISK', () => {
    expect(onPayList(feederBalance(500, []))).toBe(true);
    expect(onPayList(feederBalance(0.5, []))).toBe(false);
    expect(onPayList(feederBalance(0, [payout(5)]))).toBe(false);
  });
});
