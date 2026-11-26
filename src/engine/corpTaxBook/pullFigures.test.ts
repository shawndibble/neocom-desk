import { describe, expect, it } from 'vitest';
import {
  MOON_DOC_SCHEMA,
  computeMoonDoc,
  type MoonDoc,
  type StoredExtraction,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { ObservedRow } from '../../../functions/src/corpTaxBookEngine';
import { buildBookView, type BookViewInput } from './bookView';
import { moonDocUsable, planMoonScope, withMoonDocs } from './pullFigures';
import { extractionId } from './sync';
import type { ObservedMiningEntry } from './types';

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
    overdueDays: 14,
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
      entry(1, '2026-09-17', 500),
      entry(1, '2026-09-18', 250),
      entry(3, '2026-09-18', 100),
    ],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [FROZEN, SURVEYED, OPEN],
    pricesOn: () => ({
      prices: new Map([
        [ORE, 1000],
        [SURVEY_ORE, 800],
      ]),
      sources: new Map(),
    }),
    surveyOreLines: new Map([[extractionId(SURVEYED), [{ typeId: SURVEY_ORE, quantity: 5000 }]]]),
  };
  return first;
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
    minerOf: (c: number) => `solo:${c}`,
  };
  return new Map(
    input.extractions.map((x) => {
      const doc = computeMoonDoc(x as StoredExtraction, rows, rules);
      return [doc.extractionId, doc];
    })
  );
}

function scopedView(input: BookViewInput, shown: string, docs: Map<string, MoonDoc>) {
  const scope = planMoonScope({
    extractionId: shown,
    extractions: input.extractions,
    docs,
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
  it('reads every cycle’s window of the moon, and only those days: a doc carries no tax', () => {
    const scope = planMoonScope({
      extractionId: extractionId(OPEN),
      extractions: book().extractions,
      docs: docsOf(book()),
      expiryHours: {},
    });
    expect(scope.ok && scope.rows.map((r) => r.extractionId)).toEqual(
      book().extractions.map(extractionId)
    );
    expect(scope.ok && scope.fromDocs.size).toBe(0);
  });

  const input = book();
  const whole = buildBookView(input);
  const docs = docsOf(input);
  const ids = input.extractions.map(extractionId);

  it('prints every cycle the same from the docs as from the whole-book view', () => {
    for (const x of whole.extractions) expect(x.tax).toBeGreaterThan(0);
    for (const x of whole.extractions) expect(x.minedPct).toBeGreaterThan(0);
    for (const shown of ids) {
      const { view } = scopedView(input, shown, docs);
      expect(view!.extractions).toEqual(whole.extractions);
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

describe('moon ore variants from the moon docs (no ledger rows read)', () => {
  const BRIMFUL = 46280;
  const input = (prices: Map<number, number>): BookViewInput => ({
    ...book(),
    extractions: [FROZEN],
    entries: [entry(1, '2026-08-05', 300), entry(2, '2026-08-05', 500, BRIMFUL)],
    pricesOn: () => ({ prices, sources: new Map() }),
    surveyOreLines: new Map([
      [
        extractionId(FROZEN),
        [
          { typeId: ORE, quantity: 75 },
          { typeId: BRIMFUL, quantity: 25 },
        ],
      ],
    ]),
  });
  const viaDocs = (i: BookViewInput) =>
    withMoonDocs(buildBookView({ ...i, entries: [] }), docsOf(i), new Set([extractionId(FROZEN)]))
      .extractions[0];

  it('splits by the doc’s mined ore over the survey, and reads the same as the whole book', () => {
    const i = input(
      new Map([
        [ORE, 1000],
        [BRIMFUL, 2000],
      ])
    );
    const docRow = viaDocs(i);
    const whole = buildBookView(i).extractions[0];
    expect(docRow.oreLines).toEqual([
      { typeId: ORE, quantity: 3750 },
      { typeId: BRIMFUL, quantity: 6250 },
    ]);
    expect(docRow.oreLines).toEqual(whole.oreLines);
    expect(docRow.minedPct).toBe(whole.minedPct);
    expect(docRow.estimatedValue).toBe(3750 * 1000 + 6250 * 2000);
  });

  it('keeps the row’s value when a variant it splits into has no price on this read', () => {
    const i = input(new Map([[ORE, 1000]]));
    const before = buildBookView({ ...i, entries: [] }).extractions[0].estimatedValue;
    expect(viaDocs(i).estimatedValue).toBe(before);
  });
});
