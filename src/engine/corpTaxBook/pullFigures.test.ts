import { describe, expect, it } from 'vitest';
import {
  MOON_DOC_SCHEMA,
  computeMoonDoc,
  type MoonDoc,
  type StoredExtraction,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { ObservedRow } from '../../../functions/src/corpTaxBookEngine';
import {
  buildBookView,
  nextRunPeriod,
  planStatementRun,
  statementForLine,
  type BookViewInput,
} from './bookView';
import { moonDocUsable, planMoonScope, withMoonDocs } from './pullFigures';
import { extractionId } from './sync';
import type { ObservedMiningEntry } from './types';

// The moon page prints one pull from its rows and the moon's other cycles from their docs
// (#5716, ADR 0032). Fed the same book, the figures must match the whole-book view.

const CORP = 98000001;
const ORE = 45490;
const SURVEY_ORE = 45491;
const STRUCTURE = 1001;
const NOW = '2026-09-18T14:00:00Z';

const entry = (characterId: number, date: string, quantity: number, typeId = ORE) =>
  ({
    characterId,
    recordedCorporationId: CORP,
    structureId: STRUCTURE,
    date,
    oreLines: [{ typeId, quantity }],
  }) satisfies ObservedMiningEntry;

const pull = (startDay: string, arriveDay: string, laserDay: string, extra = {}) => ({
  structureId: STRUCTURE,
  moonId: 31,
  extractionStartTime: `${startDay}T00:00:00Z`,
  chunkArrivalTime: `${arriveDay}T00:00:00Z`,
  naturalDecayTime: `${arriveDay}T12:00:00Z`,
  laserFiredAt: `${laserDay}T12:00:00Z`,
  oreLines: [{ typeId: ORE, quantity: 10_000 }],
  ...extra,
});

// Frozen by August's Statements; later billed-but-unpaid-free; open (September); survey-sourced.
const FROZEN = pull('2026-08-01', '2026-08-05', '2026-08-05');
const SURVEYED = pull('2026-08-08', '2026-08-12', '2026-08-12', {
  oreLines: undefined,
  surveyId: 'sv',
});
const OPEN = pull('2026-09-10', '2026-09-17', '2026-09-17');

function book(): BookViewInput {
  const first: BookViewInput = {
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
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [
      entry(1, '2026-08-05', 1500),
      entry(2, '2026-08-06', 700),
      entry(1, '2026-08-12', 400, SURVEY_ORE),
      entry(2, '2026-08-13', 200, SURVEY_ORE),
      // Open: never on a Statement.
      entry(1, '2026-09-17', 500),
      entry(1, '2026-09-18', 250),
      entry(3, '2026-09-18', 100),
    ],
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [FROZEN, SURVEYED, OPEN],
    paidStatementIds: new Set<string>(),
    pricesOn: () => ({
      prices: new Map([
        [ORE, 1000],
        [SURVEY_ORE, 800],
      ]),
      sources: new Map(),
    }),
    surveyOreLines: new Map([[extractionId(SURVEYED), [{ typeId: SURVEY_ORE, quantity: 5000 }]]]),
  };
  // August issued for miners 1 and 2; miner 3 is never billed.
  const view = buildBookView(first);
  const plan = planStatementRun(view, nextRunPeriod(view)!);
  const statements = plan.lines.map((l) => ({
    ...statementForLine(view, plan, l),
    issuedAt: '2026-09-02T00:00:00Z',
  }));
  return { ...first, statements };
}

const rowsOf = (entries: readonly ObservedMiningEntry[]): ObservedRow[] =>
  entries.flatMap((e) =>
    e.oreLines.map((l) => ({
      structureId: e.structureId,
      characterId: e.characterId,
      recordedCorporationId: e.recordedCorporationId,
      typeId: l.typeId,
      date: e.date,
      quantity: l.quantity,
      cachedAt: '2026-09-18T00:00:00Z',
    }))
  );

function docsOf(input: BookViewInput): Map<string, MoonDoc> {
  const rows = rowsOf(input.entries);
  const rules = {
    expiryHours: input.structureExpiryHours,
    statements: input.statements as unknown as Record<string, unknown>[],
    minerOf: (c: number) => `solo:${c}`,
  };
  return new Map(
    input.extractions.map((x) => {
      const doc = computeMoonDoc(x as StoredExtraction, rows, rules);
      return [doc.extractionId, doc];
    })
  );
}

/** What the moon page's read returns for `shown`: only the planned pulls' rows. */
function scopedView(input: BookViewInput, shown: string, docs: Map<string, MoonDoc>) {
  const scope = planMoonScope({
    extractionId: shown,
    extractions: input.extractions,
    docs,
    statements: input.statements,
    startDate: input.startDate,
    expiryHours: input.structureExpiryHours,
  });
  if (!scope.ok) return { scope, view: undefined, read: [] as ObservedMiningEntry[] };
  const read = input.entries.filter((e) =>
    scope.rows.some((r) => e.structureId === r.structureId && e.date >= r.from && e.date <= r.to)
  );
  const view = withMoonDocs(buildBookView({ ...input, entries: read }), docs, scope.fromDocs);
  return { scope, view, read };
}

describe('the moon page from the moon docs', () => {
  const input = book();
  const whole = buildBookView(input);
  const docs = docsOf(input);
  const ids = input.extractions.map(extractionId);

  it('prints every cycle the same from the docs as from the whole-book view', () => {
    // The scenario covers what the page shows, so an empty comparison cannot pass.
    expect(input.statements.length).toBeGreaterThan(0);
    for (const x of whole.extractions) expect(x.tax).toBeGreaterThan(0);
    for (const x of whole.extractions) expect(x.minedPct).toBeGreaterThan(0);
    for (const shown of ids) {
      const { view } = scopedView(input, shown, docs);
      expect(view!.extractions).toEqual(whole.extractions);
    }
  });

  it('reads no row outside the shown pull window, and none for a frozen cycle', () => {
    const [frozen, surveyed, open] = ids;
    const onOpen = scopedView(input, open!, docs);
    expect(onOpen.read.every((e) => e.date >= '2026-09-17' && e.date <= '2026-09-19')).toBe(true);
    expect(onOpen.read.length).toBeGreaterThan(0);
    // Miner 3 never billed has no row in the frozen windows: earlier cycles read none.
    expect([...(onOpen.scope.ok ? onOpen.scope.fromDocs : [])].sort()).toEqual(
      [frozen, surveyed].sort()
    );
    // The frozen pull's own window, plus the open cycle's (a Miner there has open days); the
    // billed survey cycle between them reads nothing.
    const onFrozen = scopedView(input, frozen!, docs);
    expect(onFrozen.read.map((e) => e.date).sort()).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-09-17',
      '2026-09-18',
      '2026-09-18',
    ]);
  });

  it('reads a cycle whose Miner can still have an open day', () => {
    // Miner 4 has a Statement-free row in the frozen window: its window is read.
    const withUnbilled: BookViewInput = {
      ...input,
      entries: [...input.entries, entry(4, '2026-08-06', 300)],
    };
    const scope = planMoonScope({
      extractionId: extractionId(OPEN),
      extractions: withUnbilled.extractions,
      docs: docsOf(withUnbilled),
      statements: withUnbilled.statements,
      startDate: withUnbilled.startDate,
      expiryHours: {},
    });
    expect(scope.ok && scope.rows.map((r) => r.extractionId)).toContain(extractionId(FROZEN));
    for (const shown of ids) {
      const { view } = scopedView(withUnbilled, shown, docsOf(withUnbilled));
      expect(view!.extractions).toEqual(buildBookView(withUnbilled).extractions);
    }
  });

  it('falls back to the whole-book view when a cycle doc is missing or on another schema', () => {
    const missing = new Map(docs);
    missing.delete(ids[0]!);
    expect(scopedView(input, ids[2]!, missing).scope.ok).toBe(false);
    const other = new Map(docs);
    other.set(ids[1]!, { ...docs.get(ids[1]!)!, schema: MOON_DOC_SCHEMA + 1 });
    expect(scopedView(input, ids[2]!, other).scope.ok).toBe(false);
    const shownMissing = new Map(docs);
    shownMissing.delete(ids[2]!);
    expect(scopedView(input, ids[2]!, shownMissing).scope.ok).toBe(false);
  });

  it('reads nothing for a pull this book does not have', () => {
    const scope = planMoonScope({
      extractionId: 'nope',
      extractions: input.extractions,
      docs,
      statements: input.statements,
      startDate: input.startDate,
      expiryHours: {},
    });
    expect(scope).toEqual({ ok: true, rows: [], fromDocs: new Set() });
  });

  it('refuses a doc missing the fields the page takes', () => {
    expect(moonDocUsable(undefined)).toBe(false);
    expect(moonDocUsable({ ...docs.get(ids[0]!)!, miners: undefined } as unknown as MoonDoc)).toBe(
      false
    );
    expect(moonDocUsable({ ...docs.get(ids[0]!)!, miners: [null] } as unknown as MoonDoc)).toBe(
      false
    );
    expect(moonDocUsable(docs.get(ids[0]!))).toBe(true);
  });
});
