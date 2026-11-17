import { describe, expect, it } from 'vitest';
import type { ExtractionRow } from './bookView';
import { moonExtractions, moonRows } from './moonRows';

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

describe('moonRows', () => {
  it('makes one row per moon, counting Extractions and totalling tax', () => {
    const rows = moonRows([
      row('a', { tax: 5 }),
      row('b', { startedAt: '2026-09-01T00:00:00Z', state: 'fractured', tax: 7 }),
      row('c', { moonId: 11, structureId: 2 }),
    ]);
    expect(rows).toHaveLength(2);
    const moon = rows.find((r) => r.moonId === 10)!;
    expect(moon.extractionCount).toBe(2);
    expect(moon.tax).toBe(12);
    expect(moon.states).toEqual({ extracting: 1, fractured: 1 });
  });

  it("takes the structure and owner from the moon's newest Extraction", () => {
    const [moon] = moonRows([
      row('old', { structureId: 1, startedAt: '2026-08-01T00:00:00Z' }),
      row('new', { structureId: 2, startedAt: '2026-10-01T00:00:00Z', sourceCorporationId: 9 }),
    ]);
    expect(moon.structureId).toBe(2);
    expect(moon.sourceCorporationId).toBe(9);
  });

  it('names the next pop when a chunk is still to pop, else the last one', () => {
    const live = moonRows([
      row('a', { state: 'fractured', chunkArrivalAt: '2026-09-01T00:00:00Z' }),
      row('b', { state: 'extracting', chunkArrivalAt: '2026-10-05T00:00:00Z' }),
    ])[0];
    expect(live.nextPopAt).toBe('2026-10-05T00:00:00Z');
    expect(live.lastPopAt).toBe('2026-09-01T00:00:00Z');
    const idle = moonRows([
      row('a', { state: 'expired', chunkArrivalAt: '2026-09-01T00:00:00Z' }),
    ])[0];
    expect(idle.nextPopAt).toBeUndefined();
    expect(idle.lastPopAt).toBe('2026-09-01T00:00:00Z');
  });

  it('leaves out cancelled Extractions from pop times', () => {
    const [moon] = moonRows([row('a', { state: 'cancelled' })]);
    expect(moon.nextPopAt).toBeUndefined();
    expect(moon.lastPopAt).toBeUndefined();
    expect(moon.extractionCount).toBe(1);
  });
});

describe('moonExtractions', () => {
  it("lists one moon's Extractions newest first", () => {
    const out = moonExtractions(
      [
        row('a', { startedAt: '2026-08-01T00:00:00Z' }),
        row('b', { startedAt: '2026-10-01T00:00:00Z' }),
        row('c', { moonId: 11 }),
      ],
      10
    );
    expect(out.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
