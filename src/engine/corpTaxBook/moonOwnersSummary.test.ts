// The Moon owners tab reads each moon owner's server-built view summary instead of every ledger
// row it recorded (issue #5717, ADR 0032). These tests build the summary with the server's own
// `buildFeederView` and prove the row it gives equals the row the entries give, and that a summary
// behind the record is never used.
import { describe, expect, it } from 'vitest';
import {
  buildFeederView,
  priceKey,
  type FeederViewRecord,
} from '../../../functions/src/corpTaxBookFeederView';
import {
  buildMoonOwners,
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
  entries: readonly ObservedMiningEntry[],
  now = NOW_MS
): MoonOwnerSummary {
  const rows = entries
    .filter((e) => e.sourceCorporationId === f.corporationId)
    .flatMap((e) =>
      e.oreLines.map((l) => ({
        structureId: e.structureId,
        characterId: e.characterId,
        typeId: l.typeId,
        date: e.date,
        quantity: l.quantity,
      }))
    );
  const prices = new Map(rows.map((r) => [priceKey(r.typeId, r.date), { buy: PRICE, sell: null }]));
  const { lastReadWellAt, ...rest } = f;
  const record = {
    ...rest,
    ...(lastReadWellAt ? { lastReadWellAt: Date.parse(lastReadWellAt) } : {}),
  } as unknown as FeederViewRecord;
  return buildFeederView({
    now,
    feederCorporationId: f.corporationId,
    collectorCorporationId: BOOK,
    collectorName: null,
    record,
    graceHours: 6,
    oreForm: 'raw',
    compressedByRaw: {},
    rows,
    prices,
    payouts: f.payouts,
  }).summary as MoonOwnerSummary;
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
