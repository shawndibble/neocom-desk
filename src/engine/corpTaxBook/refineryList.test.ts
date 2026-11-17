import { describe, expect, it } from 'vitest';
import type { ExtractionRow } from './bookView';
import { newestRefineryOnMoon, refineryExtractions, refineryListRows } from './refineryList';

const row = (id: string, over: Partial<ExtractionRow> = {}): ExtractionRow => ({
  id,
  structureId: 1,
  moonId: 10,
  state: 'extracting',
  startedAt: '2026-10-01T00:00:00Z',
  chunkArrivalAt: '2026-10-05T00:00:00Z',
  plannedFractureAt: '2026-10-05T03:00:00Z',
  plannedExpiresAt: '2026-10-08T00:00:00Z',
  oreSource: 'unknown',
  oreLines: [],
  estimatedValue: null,
  minedPct: null,
  tax: 0,
  minerCount: 0,
  ...over,
});

describe('refineryListRows', () => {
  it('makes one row per refinery, counting Extractions and totalling tax', () => {
    const rows = refineryListRows([
      row('a', { tax: 5 }),
      row('b', { startedAt: '2026-09-01T00:00:00Z', state: 'fractured', tax: 7 }),
      row('c', { moonId: 11, structureId: 2 }),
    ]);
    expect(rows).toHaveLength(2);
    const refinery = rows.find((r) => r.structureId === 1)!;
    expect(refinery.extractionCount).toBe(2);
    expect(refinery.tax).toBe(12);
    expect(refinery.states).toEqual({ extracting: 1, fractured: 1 });
  });

  it("takes the moon and owner from the refinery's newest Extraction", () => {
    const [refinery] = refineryListRows([
      row('old', { moonId: 10, startedAt: '2026-08-01T00:00:00Z' }),
      row('new', { moonId: 11, startedAt: '2026-10-01T00:00:00Z', sourceCorporationId: 9 }),
    ]);
    expect(refinery.moonId).toBe(11);
    expect(refinery.sourceCorporationId).toBe(9);
  });

  it('names the next pop when a chunk is still to pop, else the last one', () => {
    const live = refineryListRows([
      row('a', { state: 'fractured', chunkArrivalAt: '2026-09-01T00:00:00Z' }),
      row('b', { state: 'extracting', chunkArrivalAt: '2026-10-05T00:00:00Z' }),
    ])[0];
    expect(live.nextPopAt).toBe('2026-10-05T00:00:00Z');
    expect(live.lastPopAt).toBe('2026-09-01T00:00:00Z');
    const idle = refineryListRows([
      row('a', { state: 'expired', chunkArrivalAt: '2026-09-01T00:00:00Z' }),
    ])[0];
    expect(idle.nextPopAt).toBeUndefined();
    expect(idle.lastPopAt).toBe('2026-09-01T00:00:00Z');
  });

  it('leaves out cancelled Extractions from pop times', () => {
    const [refinery] = refineryListRows([row('a', { state: 'cancelled' })]);
    expect(refinery.nextPopAt).toBeUndefined();
    expect(refinery.lastPopAt).toBeUndefined();
    expect(refinery.extractionCount).toBe(1);
  });
});

describe('refineryExtractions', () => {
  it("lists one refinery's Extractions newest first", () => {
    const out = refineryExtractions(
      [
        row('a', { startedAt: '2026-08-01T00:00:00Z' }),
        row('b', { startedAt: '2026-10-01T00:00:00Z' }),
        row('c', { structureId: 2 }),
      ],
      1
    );
    expect(out.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('newestRefineryOnMoon', () => {
  it("is the refinery of the moon's newest Extraction", () => {
    const xs = [
      row('old', { structureId: 1, startedAt: '2026-08-01T00:00:00Z' }),
      row('new', { structureId: 2, startedAt: '2026-10-01T00:00:00Z' }),
      row('other', { structureId: 3, moonId: 99 }),
    ];
    expect(newestRefineryOnMoon(xs, 10)).toBe(2);
  });

  it('is undefined for a moon with no Extraction', () => {
    expect(newestRefineryOnMoon([row('a')], 77)).toBeUndefined();
  });
});
