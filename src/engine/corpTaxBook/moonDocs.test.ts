import { describe, expect, it } from 'vitest';
import {
  computeMoonDoc,
  moonDocDiffers,
  planMoonDocs,
  type MoonRules,
  type StoredExtraction,
} from '../../../functions/src/corpTaxBookMoonDocs';
import type { ObservedRow } from '../../../functions/src/corpTaxBookEngine';
import { minedDuringExtraction } from './extraction';
import { toEngineExtraction } from './sync';
import type { ObservedMiningEntry } from './types';

// Per-pull moon docs (#5256, ADR 0032): the server's mined totals must equal the client
// engine's `minedDuringExtraction` whatever the rows, expiry and pulls.

/** Small seeded generator: a failing case replays from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return { next, int, chance: (p: number) => next() < p };
}

const dayOf = (n: number) => `2026-09-${String(n).padStart(2, '0')}`;

const EXTRACTIONS: StoredExtraction[] = [
  {
    structureId: 1001,
    moonId: 31,
    extractionStartTime: '2026-09-01T00:00:00Z',
    chunkArrivalTime: '2026-09-04T00:00:00Z',
    naturalDecayTime: '2026-09-06T00:00:00Z',
    laserFiredAt: '2026-09-04T12:00:00Z',
    oreLines: [
      { typeId: 1, quantity: 600 },
      { typeId: 2, quantity: 400 },
    ],
  },
  {
    structureId: 1001,
    moonId: 32,
    extractionStartTime: '2026-09-12T00:00:00Z',
    chunkArrivalTime: '2026-09-15T00:00:00Z',
    naturalDecayTime: '2026-09-17T00:00:00Z',
    surveyId: 'sv1',
  },
  {
    structureId: 1002,
    moonId: 41,
    extractionStartTime: '2026-09-02T00:00:00Z',
    chunkArrivalTime: '2026-09-06T00:00:00Z',
    naturalDecayTime: '2026-09-08T00:00:00Z',
    cancelledAt: '2026-09-03T00:00:00Z',
  },
];

const rules = (over: Partial<MoonRules> = {}): MoonRules => ({
  expiryHours: {},
  statements: [],
  minerOf: (id) => `solo:${id}`,
  ...over,
});

const row = (o: Partial<ObservedRow>): ObservedRow => ({
  structureId: 1001,
  characterId: 1,
  recordedCorporationId: 9,
  typeId: 1,
  date: dayOf(5),
  quantity: 10,
  cachedAt: '2026-09-30T00:00:00Z',
  ...o,
});

const asEntry = (r: ObservedRow): ObservedMiningEntry => ({
  characterId: r.characterId,
  recordedCorporationId: r.recordedCorporationId,
  structureId: r.structureId,
  date: r.date,
  oreLines: [{ typeId: r.typeId, quantity: r.quantity }],
});

describe('moon doc mined totals', () => {
  it('equal the engine across random rows and expiries', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const rows: ObservedRow[] = [];
      for (let i = r.int(40); i > 0; i--)
        rows.push(
          row({
            structureId: r.chance(0.7) ? 1001 : 1002,
            characterId: 1 + r.int(4),
            typeId: 1 + r.int(3),
            date: dayOf(1 + r.int(28)),
            quantity: 1 + r.int(500),
          })
        );
      const expiryHours: Record<string, number> = r.chance(0.5)
        ? { '1001': 24 * (1 + r.int(6)) }
        : {};
      for (const x of EXTRACTIONS) {
        const doc = computeMoonDoc(x, rows, rules({ expiryHours }));
        const expected = minedDuringExtraction(toEngineExtraction(x), rows.map(asEntry), {
          expiryHours: expiryHours[String(x.structureId)],
        });
        expect(doc.mined, `seed ${seed} ${doc.extractionId}`).toEqual(expected);
      }
    }
  });

  it('counts rows no charge covers and every miner of the window', () => {
    const doc = computeMoonDoc(
      EXTRACTIONS[0],
      [
        row({ characterId: 1, date: dayOf(4), quantity: 100 }),
        row({ characterId: 2, date: dayOf(6), quantity: 50 }),
        row({ characterId: 2, typeId: 2, date: dayOf(6), quantity: 25 }),
        row({ characterId: 3, date: dayOf(9), quantity: 999 }),
        row({ characterId: 4, structureId: 1002, date: dayOf(5), quantity: 999 }),
      ],
      rules({ minerOf: (id) => (id <= 2 ? 'm-a' : `solo:${id}`) })
    );
    expect(doc.mined).toEqual([
      { typeId: 1, quantity: 150 },
      { typeId: 2, quantity: 25 },
    ]);
    expect(doc.minerCount).toBe(1);
    expect(doc.miners).toEqual([
      {
        minerId: 'm-a',
        oreLines: [
          { typeId: 1, quantity: 150 },
          { typeId: 2, quantity: 25 },
        ],
      },
    ]);
  });
});

describe('moon doc chunk and tax', () => {
  it('reads the notification, else a linked survey, else unknown', () => {
    const [notified, surveyed, unknown] = EXTRACTIONS.map((x) => computeMoonDoc(x, [], rules()));
    expect(notified.chunk).toEqual({ source: 'notification', oreLines: EXTRACTIONS[0].oreLines });
    expect(surveyed.chunk).toEqual({ source: 'survey', oreLines: [] });
    expect(surveyed.surveyId).toBe('sv1');
    expect(unknown.chunk.source).toBe('unknown');
    expect(unknown.cancelled).toBe(true);
  });

  it('gives the share mined, capped per ore like the engine', () => {
    const doc = computeMoonDoc(
      EXTRACTIONS[0],
      [row({ typeId: 1, quantity: 900, date: dayOf(5) }), row({ typeId: 2, quantity: 100 })],
      rules()
    );
    // ore 1 caps at its 600, ore 2 gives 100: 700 of 1000.
    expect(doc.minedPct).toBe(70);
  });

  it('sums the tax frozen on Statement lines inside the window only', () => {
    const line = (date: string, tax: number, structureId = 1001) => ({
      kind: 'mined',
      date,
      chargeKey: `1:1:${date}`,
      structureId,
      tax,
    });
    const doc = computeMoonDoc(
      EXTRACTIONS[0],
      [],
      rules({
        statements: [
          { id: 's1', lines: [line(dayOf(4), 10.5), line(dayOf(5), 4.25), line(dayOf(20), 99)] },
          {
            id: 's2',
            lines: [line(dayOf(5), 1, 1002), { kind: 'correction', date: dayOf(5), tax: 7 }],
          },
        ],
      })
    );
    expect(doc.frozenTax).toBe(14.75);
    expect(doc.frozenLines).toBe(2);
  });
});

describe('moon doc plan', () => {
  it('writes only changed docs, deletes gone ones, and reports drift in stored docs', () => {
    const fresh = computeMoonDoc(EXTRACTIONS[0], [], rules());
    const existing = new Map<string, Record<string, unknown>>([
      [fresh.extractionId, { ...fresh, updatedAt: 'ts' }],
      ['gone_1', { extractionId: 'gone_1' }],
    ]);
    const plan = planMoonDocs(EXTRACTIONS.slice(0, 1), existing, 'all', () => [], rules());
    expect(plan.writes).toEqual([]);
    expect(plan.deletes).toEqual(['gone_1']);

    const drifted = new Map(existing);
    drifted.set(fresh.extractionId, { ...fresh, minerCount: 9 });
    const again = planMoonDocs(EXTRACTIONS.slice(0, 1), drifted, 'all', () => [], rules());
    expect(again.mismatches).toEqual([{ extractionId: fresh.extractionId }]);
    expect(moonDocDiffers(drifted.get(fresh.extractionId), fresh)).toBe(true);
  });

  it('leaves pulls outside the scope alone', () => {
    const plan = planMoonDocs(
      EXTRACTIONS,
      new Map(),
      new Set(['1001_1788220800000']),
      () => [],
      rules()
    );
    expect(plan.checked).toBe(1);
    expect(plan.writes).toHaveLength(1);
  });
});
