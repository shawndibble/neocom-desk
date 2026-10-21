import { describe, expect, it } from 'vitest';
import {
  buildMoonOwners,
  deriveModeChanges,
  deriveOwnerRateHistory,
  hasOwnRefineries,
  moonOwnerDetail,
  type MoonOwnerFeeder,
  type MoonOwnerPayout,
  type MoonOwnersInput,
} from './moonOwners';
import type { ObservedMiningEntry } from './types';

const BOOK = 98000000;
const A = 98000001;
const B = 98000002;
const NOW = '2026-10-20T12:00:00Z';

const feeder = (corporationId: number, over: Partial<MoonOwnerFeeder> = {}): MoonOwnerFeeder => ({
  corporationId,
  status: 'active',
  mode: 'normal',
  joinedAt: Date.parse('2026-10-01T10:00:00Z'),
  coveragePeriods: [{ from: '2026-10-01' }],
  lastReadWellAt: '2026-10-20T06:00:00Z',
  agreedRatePct: 8,
  payouts: [],
  ...over,
});

const payout = (id: string, date: string, amount: number, over: Partial<MoonOwnerPayout> = {}) =>
  ({
    id,
    date,
    amount,
    method: 'donation',
    status: 'matched',
    notAPayout: false,
    ...over,
  }) as const;

function entry(
  source: number | undefined,
  date: string,
  qty: number,
  over: Partial<ObservedMiningEntry> = {}
): ObservedMiningEntry {
  return {
    characterId: 1,
    recordedCorporationId: source ?? BOOK,
    structureId: source === A ? 10 : 20,
    date,
    ...(source !== undefined ? { sourceCorporationId: source } : {}),
    oreLines: [{ typeId: 100, quantity: qty }],
    ...over,
  };
}

function input(over: Partial<MoonOwnersInput> = {}): MoonOwnersInput {
  return {
    now: NOW,
    graceHours: 6,
    bookCorporationId: BOOK,
    rates: [{ scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' }],
    entries: [entry(A, '2026-10-05', 1000)],
    feeders: [feeder(A)],
    pricesOn: () => new Map([[100, 1]]),
    ...over,
  };
}

const rowOf = (i: MoonOwnersInput, id = A) =>
  buildMoonOwners(i).rows.find((r) => r.id === String(id))!;
const statusOf = (over: Partial<MoonOwnerFeeder>) =>
  rowOf(input({ feeders: [feeder(A, over)] })).status;

describe('derive history', () => {
  it('uses the stored history when present', () => {
    const history = [
      {
        kind: 'agreed' as const,
        pct: 5,
        effectiveFrom: '2026-10-02',
        recordedAt: '2026-10-02T00:00:00Z',
      },
    ];
    expect(deriveOwnerRateHistory(feeder(A, { ownerRateHistory: history }))).toBe(history);
  });

  it('derives entries from the scalar rates, dated the join day', () => {
    const f = feeder(A, { requestedRatePct: 6, agreedRatePct: 8 });
    expect(deriveOwnerRateHistory(f).map((e) => [e.kind, e.pct, e.effectiveFrom])).toEqual([
      ['requested', 6, '2026-10-01'],
      ['agreed', 8, '2026-10-01'],
    ]);
  });

  it('derives a settled-otherwise change from mode when no list is stored', () => {
    expect(deriveModeChanges(feeder(A, { mode: 'settled-otherwise' }))).toEqual([
      { from: '2026-10-01', mode: 'settled-otherwise' },
    ]);
    expect(deriveModeChanges(feeder(A))).toEqual([]);
  });
});

describe('buildMoonOwners', () => {
  it('owes the rate times the value mined at their refineries, less payouts', () => {
    const r = rowOf(input({ feeders: [feeder(A, { payouts: [payout('p', '2026-10-10', 30)] })] }));
    expect(r.mined).toBe(1000);
    expect(r.owed).toBe(50);
    expect(r.theirRatePct).toBe(8);
  });

  it('ignores the book’s own refineries and other moon owners', () => {
    const r = rowOf(
      input({
        entries: [
          entry(A, '2026-10-05', 1000),
          entry(undefined, '2026-10-05', 500),
          entry(B, '2026-10-05', 700),
        ],
      })
    );
    expect(r.mined).toBe(1000);
  });

  it('counts distinct refineries', () => {
    const r = rowOf(
      input({
        entries: [
          entry(A, '2026-10-05', 10),
          entry(A, '2026-10-06', 10, { structureId: 11 }),
          entry(A, '2026-10-07', 10),
        ],
      })
    );
    expect(r.refineryCount).toBe(2);
  });

  it('owes nothing for days outside coverage, unread days, or with no rate', () => {
    expect(rowOf(input({ entries: [entry(A, '2026-09-20', 1000)] })).owed).toBe(0);
    const unread = feeder(A, { lastReadWellAt: '2026-10-05T01:00:00Z' });
    expect(rowOf(input({ feeders: [unread] })).owed).toBe(0);
    const none = rowOf(input({ feeders: [feeder(A, { agreedRatePct: undefined })] }));
    expect(none.owed).toBe(0);
    expect(none.status).toBe('no-rate');
    expect(none.theirRatePct).toBeUndefined();
  });

  it('settled otherwise owes nothing and says so', () => {
    const r = rowOf(input({ feeders: [feeder(A, { mode: 'settled-otherwise' })] }));
    expect(r.status).toBe('settled-otherwise');
    expect(r.owed).toBe(0);
  });

  it('shows the miner rate the book charges at their refineries', () => {
    const rates = [
      { scope: 'corp' as const, pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'feeder' as const, feederId: A, pct: 11, effectiveFrom: '2026-10-01' },
    ];
    expect(rowOf(input({ rates })).minerRatePct).toBe(11);
    expect(rowOf(input()).minerRatePct).toBe(12);
  });

  it('ranks the status: removal pending, cannot read, settled, no rate, active', () => {
    const stale = Date.parse('2026-10-11T09:12:00Z');
    expect(statusOf({ status: 'pending-removal', staleSince: stale })).toBe('removal-pending');
    expect(statusOf({ staleSince: stale, mode: 'settled-otherwise' })).toBe('cant-read');
    expect(statusOf({ mode: 'settled-otherwise', agreedRatePct: undefined })).toBe(
      'settled-otherwise'
    );
    expect(statusOf({ agreedRatePct: undefined })).toBe('no-rate');
    expect(statusOf({})).toBe('active');
    expect(statusOf({ status: 'disconnected' })).toBe('disconnected');
  });

  it('reads since from coverage and until from the stale date', () => {
    expect(rowOf(input()).since).toBe('2026-10-01');
    expect(rowOf(input()).until).toBeUndefined();
    const stale = feeder(A, { staleSince: Date.parse('2026-10-11T09:12:00Z') });
    expect(rowOf(input({ feeders: [stale] })).until).toBe('2026-10-11');
  });

  it('lists a moon owner who left only while it is still owed', () => {
    const left = (payouts: MoonOwnerPayout[]) =>
      buildMoonOwners(
        input({
          feeders: [
            feeder(A, {
              status: 'left',
              coveragePeriods: [{ from: '2026-10-01', to: '2026-10-10' }],
              payouts,
            }),
          ],
        })
      ).rows.length;
    expect(left([])).toBe(1);
    expect(left([payout('p', '2026-10-11', 80)])).toBe(0);
  });

  it('totals owed, paid this month and what needs a look', () => {
    const { totals } = buildMoonOwners(
      input({
        entries: [entry(A, '2026-10-05', 1000), entry(B, '2026-10-05', 1000, { structureId: 30 })],
        feeders: [
          feeder(A, {
            payouts: [
              payout('p1', '2026-10-10', 20),
              payout('p2', '2026-10-11', 999, { notAPayout: true }),
              payout('p3', '2026-09-30', 5),
            ],
          }),
          feeder(B, { agreedRatePct: undefined }),
        ],
      })
    );
    expect(totals).toEqual({ owed: 55, paidThisMonth: 20, count: 2, needALook: 1 });
  });
});

describe('moonOwnerDetail', () => {
  it('lists rate history and payouts newest first', () => {
    const d = moonOwnerDetail(
      input({
        feeders: [
          feeder(A, {
            ownerRateHistory: [
              {
                kind: 'requested',
                pct: 6,
                effectiveFrom: '2026-10-01',
                recordedAt: '2026-10-01T09:00:00Z',
              },
              {
                kind: 'agreed',
                pct: 8,
                effectiveFrom: '2026-10-01',
                recordedAt: '2026-10-01T11:00:00Z',
              },
            ],
            payouts: [payout('a', '2026-10-04', 8), payout('b', '2026-10-16', 12)],
          }),
        ],
      }),
      A
    )!;
    expect(d.history.map((h) => h.kind)).toEqual(['agreed', 'requested']);
    expect(d.requestedRatePct).toBe(6);
    expect(d.payouts.map((p) => p.id)).toEqual(['b', 'a']);
    expect(d.accrued).toBe(80);
    expect(d.paid).toBe(20);
  });

  it('groups mined ore by character and refinery', () => {
    const d = moonOwnerDetail(
      input({
        entries: [
          entry(A, '2026-10-05', 100),
          entry(A, '2026-10-06', 200),
          entry(A, '2026-10-06', 50, { characterId: 2 }),
        ],
      }),
      A
    )!;
    expect(d.mined).toEqual([
      { characterId: 1, structureId: 10, oreTypeIds: [100], quantity: 300, value: 300 },
      { characterId: 2, structureId: 10, oreTypeIds: [100], quantity: 50, value: 50 },
    ]);
  });

  it('pays the moon owner itself unless a payee is set, with the days since the last payment', () => {
    const plain = moonOwnerDetail(
      input({ entries: [entry(A, '2026-10-05', 100), entry(A, '2026-10-12', 100)] }),
      A
    )!;
    expect(plain.payee).toEqual({ kind: 'corporation', id: A });
    expect(plain.period).toEqual({ from: '2026-10-05', to: '2026-10-12' });
    const set = moonOwnerDetail(
      input({
        entries: [entry(A, '2026-10-05', 100), entry(A, '2026-10-12', 100)],
        feeders: [
          feeder(A, {
            payee: { kind: 'character', id: 7 },
            payouts: [payout('a', '2026-10-06', 1)],
          }),
        ],
      }),
      A
    )!;
    expect(set.payee).toEqual({ kind: 'character', id: 7 });
    expect(set.period).toEqual({ from: '2026-10-12', to: '2026-10-12' });
  });

  it('is undefined for a corporation that is not a moon owner', () => {
    expect(moonOwnerDetail(input(), 5)).toBeUndefined();
  });
});

describe('hasOwnRefineries', () => {
  it('is false for a book that only reads moon owners', () => {
    expect(hasOwnRefineries([entry(A, '2026-10-05', 1)], 0, BOOK)).toBe(false);
    expect(hasOwnRefineries([], 0, BOOK)).toBe(false);
  });

  it('is true with an extraction notice or a row of its own', () => {
    expect(hasOwnRefineries([], 1, BOOK)).toBe(true);
    expect(hasOwnRefineries([entry(undefined, '2026-10-05', 1)], 0, BOOK)).toBe(true);
    expect(hasOwnRefineries([entry(BOOK, '2026-10-05', 1)], 0, BOOK)).toBe(true);
  });
});
