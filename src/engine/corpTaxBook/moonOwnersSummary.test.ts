// The Moon owners tab reads each moon owner's server-built view summary instead of every ledger
// row it recorded (issue #5717, ADR 0032). The summary is assembled here from the functions
// mirror of the engine (`buildFeederView` sits in a module that needs the functions runtime, which
// the root install lacks) the way the server does, and the row it gives must equal the row the
// entries give. A summary behind its record is never used.
import { describe, expect, it } from 'vitest';
import * as server from '../../../functions/src/corpTaxBookEngine';
import {
  buildMoonOwners,
  hasOwnRefineries,
  moonOwnersNeedRows,
  ownRefineriesFromStored,
  summaryFor,
  type MoonOwnerFeeder,
  type MoonOwnerPayout,
  type MoonOwnerSummary,
  type MoonOwnersInput,
} from './moonOwners';
import type { TaxRate } from './rates';
import type { ObservedMiningEntry } from './types';

const BOOK = 98000000;
const A = 98000001;
const B = 98000002;
const ORE = 100;
const NOW = '2026-10-20T12:00:00Z';
const NOW_MS = Date.parse(NOW);
const READ = '2026-10-20T06:00:00Z';

const entry = (
  source: number,
  date: string,
  quantity: number,
  structureId = 10
): ObservedMiningEntry => ({
  characterId: 1,
  recordedCorporationId: BOOK,
  structureId,
  date,
  sourceCorporationId: source,
  oreLines: [{ typeId: ORE, quantity }],
});

const feeder = (corporationId: number, over: Partial<MoonOwnerFeeder> = {}): MoonOwnerFeeder => ({
  corporationId,
  status: 'active',
  mode: 'normal',
  joinedAt: Date.parse('2026-10-01T10:00:00Z'),
  lastReadWellAt: READ,
  coveragePeriods: [{ from: '2026-10-01' }],
  agreedRatePct: 8,
  payouts: [],
  ...over,
});

const payout = (id: string, date: string, amount: number): MoonOwnerPayout => ({
  id,
  date,
  amount,
  method: 'donation',
  status: 'matched',
  notAPayout: false,
});

const ENTRIES = [
  entry(A, '2026-10-05', 1000),
  entry(A, '2026-10-06', 400, 11),
  entry(A, '2026-09-20', 900), // before coverage: mined, never owed
  entry(B, '2026-10-05', 250, 20),
];
const PRICE = 123.45;

/** The summary the server writes for `f`, from the same rows, prices and payouts. */
function serverSummary(
  f: MoonOwnerFeeder,
  entries: readonly ObservedMiningEntry[]
): MoonOwnerSummary {
  const rows = entries
    .filter((e) => e.sourceCorporationId === f.corporationId)
    .flatMap((e) =>
      e.oreLines.map((l) => ({ structureId: e.structureId, date: e.date, quantity: l.quantity }))
    );
  const unit = server.moonOwnerUnitPrice({ buy: PRICE, sell: null });
  const history = server.deriveOwnerRateHistory(f);
  const modeChanges = server.deriveModeChanges(f);
  const byDay = new Map<string, number>();
  let mined = 0;
  for (const r of rows) {
    if (!server.isDayCovered(f.coveragePeriods, r.date)) continue;
    mined += r.quantity * unit;
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.quantity * unit);
  }
  const accrual = server.accrueValuedDays(
    [...byDay].map(([date, value]) => ({ date, value })),
    {
      coveragePeriods: f.coveragePeriods,
      ownerRateHistory: history,
      modeChanges,
      isBillable: server.feederBillableRule(
        f.lastReadWellAt ? Date.parse(f.lastReadWellAt) : undefined,
        6
      ),
    }
  );
  const settled = modeChanges.some(
    (c) => c.from <= NOW.slice(0, 10) && c.mode === 'settled-otherwise'
  );
  const { display } = server.feederBalance(accrual.accrued, f.payouts, settled);
  const periods = [...f.coveragePeriods].sort((a, b) => a.from.localeCompare(b.from));
  return {
    schemaVersion: 1,
    status: f.status,
    builtAt: NOW_MS,
    coverageFrom: periods[0]?.from ?? null,
    coverageTo: periods.at(-1)?.to ?? null,
    lastReadWellAt: f.lastReadWellAt ? Date.parse(f.lastReadWellAt) : null,
    rateHistory: history,
    minedValueIsk: mined,
    accruedIsk: accrual.accrued,
    paidIsk: f.payouts.reduce((sum, p) => (p.notAPayout ? sum : sum + p.amount), 0),
    balanceKind: display.kind,
    balanceIsk: display.isk,
    refineryCount: new Set(rows.map((r) => r.structureId)).size,
    unpricedDays: 0,
  };
}

function input(
  feeders: MoonOwnerFeeder[],
  over: Partial<MoonOwnersInput> = {},
  entries = ENTRIES
): MoonOwnersInput {
  return {
    now: NOW,
    graceHours: 6,
    bookCorporationId: BOOK,
    rates: [{ scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' }],
    entries,
    feeders,
    pricesOn: () => new Map([[ORE, PRICE]]),
    ...over,
  };
}

const withSummaries = (i: MoonOwnersInput, entries = i.entries): MoonOwnersInput => ({
  ...i,
  summaries: new Map(i.feeders.map((f) => [f.corporationId, serverSummary(f, entries)])),
});

/** The tab built from summaries, with no entry at all. */
const fromSummaries = (i: MoonOwnersInput) => buildMoonOwners({ ...withSummaries(i), entries: [] });

const FEEDERS: Record<string, MoonOwnerFeeder[]> = {
  'an owner owed ISK': [feeder(A)],
  'two owners, one with a payout over a part': [
    feeder(A, { payouts: [payout('p1', '2026-10-10', 500)] }),
    feeder(B, { agreedRatePct: 5 }),
  ],
  'an owner paid more than owed (credit)': [
    feeder(A, { payouts: [payout('p1', '2026-10-10', 1e9)] }),
  ],
  'an owner paid exactly (even)': [feeder(A, { payouts: [payout('p1', '2026-10-10', 1000)] })],
  'an owner settled otherwise': [
    feeder(A, {
      mode: 'settled-otherwise',
      modeChanges: [{ from: '2026-10-01', mode: 'settled-otherwise' }],
    }),
  ],
  'a stale owner': [feeder(A, { staleSince: Date.parse('2026-10-11T09:12:00Z') })],
  'an owner with a closed coverage': [
    feeder(A, { coveragePeriods: [{ from: '2026-10-01', to: '2026-10-05' }] }),
  ],
  'an owner with no rate': [feeder(A, { agreedRatePct: undefined })],
};

describe('the Moon owners tab from summaries', () => {
  it.each(Object.entries(FEEDERS))('%s: the row equals the one the entries give', (_n, feeders) => {
    const i = input(feeders);
    const fromEntries = buildMoonOwners(i);
    const built = fromSummaries(i);
    expect(built.rows).toEqual(fromEntries.rows);
    expect(built.totals).toEqual(fromEntries.totals);
  });

  it('reads no entry: an empty ledger changes nothing', () => {
    const i = input([feeder(A), feeder(B, { agreedRatePct: 5 })]);
    const summarised = withSummaries(i);
    const noEntries = { ...summarised, entries: [] };
    expect(buildMoonOwners(noEntries)).toEqual(buildMoonOwners(summarised));
    expect(buildMoonOwners(noEntries).rows.map((r) => r.mined)).not.toContain(0);
  });

  it('a moon owner with no ore yet is priced as Guests, the way billing does', () => {
    const rates: TaxRate[] = [
      { scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'guest', pct: 20, effectiveFrom: '2026-01-01' },
    ];
    const i = input([feeder(A)], { rates }, []);
    expect(fromSummaries(i).rows).toEqual(buildMoonOwners(i).rows);
    expect(fromSummaries(i).rows[0]?.minerRatePct).toBe(20);
  });

  it('a Guest, per-refinery or per-moon rate depends on the entry: the entries answer, or none', () => {
    for (const extra of [
      { scope: 'guest', pct: 20, effectiveFrom: '2026-01-01' },
      { scope: 'structure', structureId: 10, pct: 9, effectiveFrom: '2026-01-01' },
      { scope: 'moon', moonId: 5, pct: 9, effectiveFrom: '2026-01-01' },
    ] as TaxRate[]) {
      const rates: TaxRate[] = [{ scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' }, extra];
      const i = input([feeder(A)], { rates });
      // Entries held: the same rate as the entry path. Everything else still from the summary.
      expect(buildMoonOwners(withSummaries(i)).rows).toEqual(buildMoonOwners(i).rows);
      // No entries held: no rate is invented.
      const bare = fromSummaries(i).rows[0]!;
      expect(bare.minerRatePct).toBeUndefined();
      expect({ ...bare, minerRatePct: undefined }).toEqual({
        ...buildMoonOwners(i).rows[0]!,
        minerRatePct: undefined,
      });
    }
  });
});

describe('summaryFor', () => {
  const base = () => input([feeder(A, { payouts: [payout('p1', '2026-10-10', 500)] })]);
  const use = (i: MoonOwnersInput) => summaryFor(withSummaries(i), i.feeders[0]!);

  it('uses a summary that matches its record', () => {
    expect(use(base())).toBeDefined();
  });

  it('is undefined with no summary, or one for another schema', () => {
    const i = base();
    expect(summaryFor(i, i.feeders[0]!)).toBeUndefined();
    const s = serverSummary(i.feeders[0]!, ENTRIES);
    const old = { ...i, summaries: new Map([[A, { ...s, schemaVersion: 2 as never }]]) };
    expect(summaryFor(old, i.feeders[0]!)).toBeUndefined();
  });

  it.each([
    ['an officer set a rate after it was built', { agreedRatePct: 9, ownerRateHistory: undefined }],
    ['an officer set settled otherwise after it', { mode: 'settled-otherwise' as const }],
    [
      'a payout was recorded after it',
      { payouts: [payout('p1', '2026-10-10', 500), payout('p2', '2026-10-12', 1)] },
    ],
    ['the ledger was read again after it', { lastReadWellAt: '2026-10-20T11:00:00Z' }],
    ['the status moved after it', { status: 'pending-removal' as const }],
    [
      'a settled window has closed, which the summary cannot show',
      {
        modeChanges: [
          { from: '2026-10-02', mode: 'settled-otherwise' as const },
          { from: '2026-10-08', mode: 'normal' as const },
        ],
      },
    ],
    [
      'it has interior coverage periods',
      {
        coveragePeriods: [
          { from: '2026-10-01', to: '2026-10-02' },
          { from: '2026-10-04', to: '2026-10-06' },
          { from: '2026-10-08' },
        ],
      },
    ],
    ['coverage changed after it', { coveragePeriods: [{ from: '2026-10-03' }] }],
  ])('is undefined when %s: the entries price the row instead', (_n, over) => {
    const i = base();
    const s = serverSummary(i.feeders[0]!, ENTRIES);
    const moved = feeder(A, { payouts: [payout('p1', '2026-10-10', 500)], ...over });
    const stale = { ...i, feeders: [moved], summaries: new Map([[A, s]]) };
    expect(summaryFor(stale, moved)).toBeUndefined();
    // And the row is the entries' row, not the summary's.
    expect(buildMoonOwners(stale).rows).toEqual(
      buildMoonOwners({ ...stale, summaries: undefined }).rows
    );
  });

  it('is undefined when the server left a day unpriced', () => {
    const i = base();
    const s = serverSummary(i.feeders[0]!, ENTRIES);
    expect(
      summaryFor({ ...i, summaries: new Map([[A, { ...s, unpricedDays: 1 }]]) }, i.feeders[0]!)
    ).toBeUndefined();
  });

  it('keeps the entry path for one owner and the summary for the rest', () => {
    const i = input([feeder(A), feeder(B, { agreedRatePct: 5 })]);
    const s = withSummaries(i);
    const onlyA = { ...s, summaries: new Map([[A, s.summaries!.get(A)!]]) };
    expect(buildMoonOwners(onlyA).rows).toEqual(buildMoonOwners(i).rows);
  });
});

describe('moonOwnersNeedRows (#5717)', () => {
  const bare = (i: MoonOwnersInput): Omit<MoonOwnersInput, 'entries' | 'pricesOn'> => ({
    now: i.now,
    graceHours: i.graceHours,
    bookCorporationId: i.bookCorporationId,
    rates: i.rates,
    feeders: i.feeders,
    ...(i.summaries ? { summaries: i.summaries } : {}),
  });

  it.each(Object.entries(FEEDERS))('%s: needs no row when the summary stands in', (_n, feeders) => {
    const i = withSummaries(input(feeders));
    // Only an owner the summary cannot stand in for asks for rows, and then the answer is yes.
    const needs = moonOwnersNeedRows(bare(i));
    const noRows = buildMoonOwners({ ...i, entries: [] });
    if (!needs) expect(noRows.rows).toEqual(buildMoonOwners(i).rows);
  });

  it('needs none for a plain owner with a current summary', () => {
    expect(moonOwnersNeedRows(bare(withSummaries(input([feeder(A)]))))).toBe(false);
  });

  it('needs rows for an owner with no summary, or a stale or unpriced one', () => {
    const i = input([feeder(A), feeder(B, { agreedRatePct: 5 })]);
    expect(moonOwnersNeedRows(bare(i))).toBe(true);
    const s = withSummaries(i);
    const onlyA = { ...s, summaries: new Map([[A, s.summaries!.get(A)!]]) };
    expect(moonOwnersNeedRows(bare(onlyA))).toBe(true);
    const unpriced = new Map(s.summaries!);
    unpriced.set(A, { ...unpriced.get(A)!, unpricedDays: 1 });
    expect(moonOwnersNeedRows(bare({ ...s, summaries: unpriced }))).toBe(true);
  });

  it('needs rows when a miner rate depends on the entry', () => {
    const rates: TaxRate[] = [
      { scope: 'corp', pct: 12, effectiveFrom: '2026-01-01' },
      { scope: 'guest', pct: 20, effectiveFrom: '2026-01-01' },
    ];
    expect(moonOwnersNeedRows(bare(withSummaries(input([feeder(A)], { rates }))))).toBe(true);
  });
});

describe('ownRefineriesFromStored (#5717)', () => {
  const rows = (...sources: (number | undefined)[]) =>
    sources.map((sourceCorporationId) => ({ sourceCorporationId }));

  it('settles the answer the rows give whenever an Extraction exists or there is no moon owner', () => {
    for (const entries of [rows(), rows(A), rows(undefined), rows(BOOK)]) {
      for (const [extractions, feeders] of [
        [1, 1],
        [3, 0],
        [0, 0],
      ] as const) {
        expect(ownRefineriesFromStored(extractions, feeders)).toBe(true);
        // The tab's own rule: own refineries, or no moon owner yet.
        expect(hasOwnRefineries(entries, extractions, BOOK) || feeders === 0).toBe(true);
      }
    }
  });

  it('is undecided when only the rows can tell', () => {
    expect(ownRefineriesFromStored(0, 2)).toBeUndefined();
  });
});
