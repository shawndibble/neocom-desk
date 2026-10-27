import { describe, expect, it } from 'vitest';
import {
  buildReadModels,
  plainData,
  planReadModels,
  READ_MODELS_SCHEMA,
} from '../../../functions/src/corpTaxBookReadModels';
import type { BookRecords } from '../../../functions/src/corpTaxBookMinerTotals';
import { buildBookView, nextRunPeriod, planStatementRun, statementForLine } from './bookView';
import type { BookViewInput } from './bookView';
import { observedEntryKey } from './observed';
import { fromBookView, fromReadModels, openSetOf, readModelsUsable } from './readModels';
import type { ObservedMiningEntry } from './types';

// The Overview and Miners tabs read either the whole-book view or the two server-built
// docs (#5259, ADR 0032). Fed the same book, both must print the same figures.

const CORP = 98000001;
const OTHER_CORP = 98000099;
const ORE = 45490;
const NOW = '2026-09-18T14:00:00Z';

const entry = (characterId: number, date: string, quantity: number, corp = CORP) =>
  ({
    characterId,
    recordedCorporationId: corp,
    structureId: 1001,
    date,
    oreLines: [{ typeId: ORE, quantity }],
  }) satisfies ObservedMiningEntry;

const extraction = (moonId: number, startDay: string, arriveDay: string, extra = {}) => ({
  structureId: 1001,
  moonId,
  extractionStartTime: `${startDay}T00:00:00Z`,
  chunkArrivalTime: `${arriveDay}T00:00:00Z`,
  naturalDecayTime: `${arriveDay}T12:00:00Z`,
  oreLines: [{ typeId: ORE, quantity: 100_000 }],
  ...extra,
});

function base(): BookViewInput {
  return {
    corporationId: CORP,
    now: NOW,
    startDate: '2026-08-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-09-18T12:00:00Z',
    // Rated from Aug 5: the Aug 2 day is unrated.
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-05' }],
    entries: [
      entry(1, '2026-07-30', 5000),
      entry(1, '2026-08-10', 2000),
      entry(1, '2026-09-10', 1000),
      entry(1, '2026-09-17', 500),
      entry(1, '2026-09-18', 300),
      entry(2, '2026-08-12', 1000),
      entry(3, '2026-08-11', 1000),
      entry(4, '2026-08-14', 1000),
      entry(5, '2026-08-15', 500, OTHER_CORP),
      entry(6, '2026-08-02', 700),
      entry(7, '2026-08-13', 400),
      entry(8, '2026-08-13', 600),
      entry(9, '2026-09-16', 100),
    ],
    miners: [{ id: 'm-a', characterIds: [7, 8], mainCharacterId: 7 }],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [
      // Fractured, still mineable.
      extraction(31, '2026-09-10', '2026-09-17', { laserFiredAt: '2026-09-17T12:00:00Z' }),
      // Chunk arrived, not fractured: Ready.
      extraction(32, '2026-09-12', '2026-09-18', { naturalDecayTime: '2026-09-20T00:00:00Z' }),
      // Extracting, arrives inside the week; and one further off.
      extraction(33, '2026-09-15', '2026-09-22'),
      extraction(34, '2026-09-16', '2026-10-30'),
      // Long expired, and cancelled: not listed.
      extraction(35, '2026-08-01', '2026-08-05'),
      extraction(36, '2026-09-14', '2026-09-24', { cancelledAt: '2026-09-15T00:00:00Z' }),
    ],
    paidStatementIds: new Set<string>(),
    pricesOn: () => ({
      prices: new Map([[ORE, 1000]]),
      sources: new Map([[ORE, 'saved' as const]]),
    }),
    memberIds: new Set([1, 2, 3, 7, 8, 9]),
  };
}

/** August issued for everyone, then payments, declarations, a dismissal, a write-off and a correction. */
function book(): BookViewInput {
  const first = base();
  const view = buildBookView(first);
  const period = nextRunPeriod(view)!;
  const plan = planStatementRun(view, period);
  const issuedAt = (id: string) =>
    id.endsWith('solo:3') ? '2026-08-25T00:00:00Z' : '2026-09-02T00:00:00Z';
  const statements = plan.lines.map((l) => {
    const s = statementForLine(view, plan, l);
    return { ...s, issuedAt: issuedAt(s.id) };
  });
  const id = (minerId: string) => statements.find((s) => s.minerId === minerId)!.id;
  return {
    ...first,
    statements,
    payments: [
      {
        id: 'p1',
        minerId: 'solo:1',
        characterId: 1,
        amount: 50_000,
        at: '2026-09-05T00:00:00Z',
        source: 'manual',
      },
      { id: 'p2', characterId: 99, amount: 10_000, at: '2026-09-06T00:00:00Z', source: 'donation' },
      {
        id: 'p3',
        minerId: 'solo:1',
        characterId: 1,
        amount: 9_000,
        at: '2026-07-20T00:00:00Z',
        source: 'donation',
      },
      {
        id: 'p4',
        minerId: 'solo:5',
        characterId: 5,
        amount: 60_000,
        at: '2026-09-07T00:00:00Z',
        source: 'donation',
        statementId: id('solo:5'),
      },
      {
        id: 'p5',
        minerId: 'solo:1',
        characterId: 1,
        amount: 20_000,
        notTaxAmount: 5_000,
        at: '2026-09-08T00:00:00Z',
        source: 'donation',
      },
      {
        id: 'p6',
        minerId: 'm-a',
        characterId: 7,
        amount: 20_000,
        at: '2026-09-09T00:00:00Z',
        source: 'manual',
      },
    ],
    declarations: [
      { id: 'd1', statementId: id('solo:2'), kind: 'contract', at: '2026-09-15T00:00:00Z' },
      {
        id: 'd2',
        statementId: id('solo:3'),
        kind: 'wrong-corp',
        at: '2026-09-01T00:00:00Z',
        resolution: { kind: 'rejected', at: '2026-09-02T00:00:00Z' },
      },
      { id: 'd3', statementId: id('solo:4'), kind: 'other-division', at: '2026-09-10T00:00:00Z' },
    ],
    dismissals: [
      {
        id: 'x1',
        scope: 'record',
        targetId: observedEntryKey(entry(3, '2026-08-11', 1000)),
        by: 1,
        at: '2026-09-04T00:00:00Z',
        reason: 'test',
      },
    ],
    writeOffs: [
      {
        id: 'w1',
        minerId: 'solo:2',
        amount: 30_000,
        at: '2026-09-12T00:00:00Z',
        reason: 'x',
        statementId: id('solo:2'),
      },
    ],
    adjustments: [
      {
        id: 'a1',
        minerId: 'solo:1',
        date: '2026-08-10',
        amount: 5_000,
        reason: 'fix',
        by: 1,
        at: '2026-09-03T00:00:00Z',
      },
    ],
  };
}

/** The book's stored records, as Firestore would hold them. */
function recordsOf(input: BookViewInput): BookRecords {
  const plain = <T>(x: T) => plainData(x) as unknown as Record<string, unknown>[];
  return {
    startDate: input.startDate,
    overdueDays: input.overdueDays,
    expiryHours: input.structureExpiryHours,
    dismissals: plain(input.dismissals),
    declarations: plain(input.declarations),
    extractions: plain(input.extractions),
    statements: plain(input.statements),
    payments: plain(input.payments),
    writeOffs: plain(input.writeOffs ?? []),
    miners: plain(input.miners),
  };
}

const docsAt = (input: BookViewInput, builtAt = NOW) =>
  plainData(buildReadModels(recordsOf(input), Date.parse(builtAt)));

describe('Overview and Miners tab read models', () => {
  it('prints the same figures from the docs as from the whole-book view', () => {
    const input = book();
    const view = buildBookView(input);
    const old = fromBookView(view);
    const next = fromReadModels(docsAt(input), input);
    // The scenario exercises what the tabs show, so an empty comparison cannot pass.
    expect(old.needsYou.map((i) => i.kind).sort()).toEqual(
      expect.arrayContaining(['declaration', 'overdue', 'unmatched', 'leaver'])
    );
    expect(old.miners.some((m) => m.paused)).toBe(true);
    expect(old.miners.some((m) => m.credit > 0)).toBe(true);
    expect(old.miners.some((m) => m.standing === 'guest')).toBe(true);
    expect(old.miners.some((m) => m.pending > 0)).toBe(true);
    expect(old.unratedCount).toBeGreaterThan(0);
    expect(old.donationsBeforeBook).toBe(1);
    expect(old.schedule.fractured).toHaveLength(1);
    expect(old.schedule.ready).toHaveLength(1);
    expect(old.schedule.pops).toHaveLength(1);
    expect(next).toEqual(old);
  });

  it('still agrees when the docs are read days after they were built', () => {
    const input = book();
    // Built a few days earlier: the figures that move with the clock are computed on read.
    const docs = docsAt(input, '2026-09-14T00:00:00Z');
    for (const now of ['2026-09-21T09:00:00Z', '2026-09-30T00:00:00Z', '2026-10-25T00:00:00Z']) {
      const later = { ...input, now, lastSyncedAt: now };
      expect(fromReadModels(docs, later)).toEqual(fromBookView(buildBookView(later)));
    }
  });

  it('lists no Miner as owing or overdue in a book with nothing issued', () => {
    const input = base();
    const next = fromReadModels(docsAt(input), input);
    expect(next).toEqual(fromBookView(buildBookView(input)));
    expect(next.totals.owed).toBe(0);
    expect(next.needsYou).toEqual([]);
  });

  it('computes the open set the same way the view does', () => {
    const input = book();
    const view = buildBookView(input);
    const open = openSetOf(input);
    expect(open.billableThrough).toBe(view.billableThrough);
    expect(open.unratedCount).toBe(view.unrated.length);
    expect([...open.byMiner].map(([id, a]) => [id, a.unbilled, a.pending])).toEqual(
      view.miners.map((m) => [m.id, m.unbilled, m.pending])
    );
  });

  it('keeps an Extraction that has not arrived yet, so the pops window can reach it later', () => {
    const docs = docsAt(book());
    const ids = (docs.overview.extractions as { moonId: number }[]).map((x) => x.moonId).sort();
    expect(ids).toEqual([31, 32, 33, 34]);
  });

  it('plans a write only for the docs that differ, whatever order Firestore returns fields in', () => {
    const records = recordsOf(book());
    const fresh = buildReadModels(records, Date.parse(NOW));
    const held = new Map(
      Object.entries(plainData(fresh)).map(([id, doc]) => [
        id,
        // Firestore hands fields back sorted by name.
        Object.fromEntries(Object.entries(doc as object).sort(([a], [b]) => b.localeCompare(a))),
      ])
    );
    expect(planReadModels(fresh, held).writes).toEqual([]);
    held.delete('overview');
    expect(planReadModels(fresh, held).mismatches).toEqual([{ id: 'overview', kind: 'missing' }]);
    held.set('overview', { ...plainData(fresh.overview), donationsBeforeBook: 9 });
    expect(planReadModels(fresh, held).mismatches).toEqual([{ id: 'overview', kind: 'stale' }]);
  });

  it('uses a doc only from the schema the client reads', () => {
    const docs = docsAt(book());
    expect(readModelsUsable(docs.minerList, docs.overview, READ_MODELS_SCHEMA)).toBe(true);
    expect(readModelsUsable(docs.minerList, docs.overview, READ_MODELS_SCHEMA + 1)).toBe(false);
    expect(readModelsUsable(undefined, docs.overview, READ_MODELS_SCHEMA)).toBe(false);
  });
});
