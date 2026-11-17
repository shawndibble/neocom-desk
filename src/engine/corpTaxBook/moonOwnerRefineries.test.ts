import { describe, expect, it } from 'vitest';
import {
  REFINERY_IDLE_DAYS,
  refineryMonths,
  refineryRows,
  type RefineryExtraction,
  type RefineryMining,
} from './moonOwnerRefineries';

const NOW = '2026-11-17T12:00:00Z';
const ext = (structureId: number, startedAt: string, over: Partial<RefineryExtraction> = {}) => ({
  structureId,
  moonId: 900 + structureId,
  startedAt,
  chunkArrivalAt: startedAt,
  ...over,
});
const mined = (
  structureId: number,
  date: string,
  over: Partial<RefineryMining> = {}
): RefineryMining => ({ structureId, characterId: 1, date, quantity: 10, value: 100, ...over });

const rows = (over: Partial<Parameters<typeof refineryRows>[0]> = {}) =>
  refineryRows({
    now: NOW,
    structureIds: [1],
    extractions: [],
    mining: [],
    isGone: () => false,
    ...over,
  });

describe('refineryRows', () => {
  it('uses 60 days', () => expect(REFINERY_IDLE_DAYS).toBe(60));

  it('counts Extractions, names the moon, totals mining and finds the last dates', () => {
    const { active } = rows({
      extractions: [ext(1, '2026-11-10T00:00:00Z'), ext(1, '2026-10-01T00:00:00Z')],
      mining: [
        mined(1, '2026-11-12'),
        mined(1, '2026-11-01', { value: 50 }),
        mined(2, '2026-11-13'),
      ],
    });
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      structureId: 1,
      moonId: 901,
      extractionCount: 2,
      lastExtractionAt: '2026-11-10T00:00:00Z',
      lastMinedOn: '2026-11-12',
      mined: 150,
      offer: null,
    });
  });

  it('offers "gone" when ESI shows the structure gone, even with recent activity', () => {
    const { active } = rows({ mining: [mined(1, '2026-11-16')], isGone: () => true });
    expect(active[0].offer).toEqual({ kind: 'gone' });
  });

  it('offers idle at exactly 60 days since the last Extraction or mining, not at 59', () => {
    const at60 = rows({ extractions: [ext(1, '2026-09-18T00:00:00Z')] }).active[0];
    expect(at60.offer).toEqual({ kind: 'idle', days: 60 });
    const at59 = rows({ extractions: [ext(1, '2026-09-19T00:00:00Z')] }).active[0];
    expect(at59.offer).toBeNull();
  });

  it('mining keeps it from idling even when the last Extraction is old', () => {
    const { active } = rows({
      extractions: [ext(1, '2026-06-01T00:00:00Z')],
      mining: [mined(1, '2026-11-10')],
    });
    expect(active[0].offer).toBeNull();
  });

  it('a chunk still to come is activity', () => {
    const { active } = rows({
      extractions: [ext(1, '2026-08-01T00:00:00Z', { chunkArrivalAt: '2026-11-20T00:00:00Z' })],
    });
    expect(active[0].offer).toBeNull();
  });

  it('offers nothing when it has no Extraction and no mining to measure', () => {
    expect(rows().active[0].offer).toBeNull();
  });

  it('files an archived refinery apart, with its archive', () => {
    const archive = {
      1: { at: Date.parse('2026-11-01T10:00:00Z'), by: 7, reason: 'gone' as const },
    };
    const out = rows({ archive, mining: [mined(1, '2026-10-20')] });
    expect(out.active).toEqual([]);
    expect(out.archived[0]).toMatchObject({ structureId: 1, archive: archive[1], mined: 100 });
    expect(out.archived[0].offer).toBeNull();
  });

  it('mining after the archive day restores it; mining on or before that day does not', () => {
    const archive = {
      1: { at: Date.parse('2026-11-01T10:00:00Z'), by: 7, reason: 'manual' as const },
    };
    expect(rows({ archive, mining: [mined(1, '2026-11-01')] }).archived).toHaveLength(1);
    const back = rows({ archive, mining: [mined(1, '2026-11-02')] });
    expect(back.archived).toEqual([]);
    expect(back.active).toHaveLength(1);
  });

  it('keeps every refinery asked for, archived or not, and sorts by name key given', () => {
    const out = rows({
      structureIds: [3, 1, 2],
      archive: { 2: { at: 1, by: 1, reason: 'manual' } },
    });
    expect(out.active.map((r) => r.structureId)).toEqual([3, 1]);
    expect(out.archived.map((r) => r.structureId)).toEqual([2]);
  });
});

describe('refineryMonths', () => {
  it('sums a refinery by month, newest first, counting distinct miners', () => {
    const out = refineryMonths(
      [
        mined(1, '2026-11-02', { characterId: 1 }),
        mined(1, '2026-11-09', { characterId: 1 }),
        mined(1, '2026-11-10', { characterId: 2, quantity: 5, value: 20 }),
        mined(1, '2026-10-30', { characterId: 3 }),
        mined(2, '2026-11-10'),
      ],
      1
    );
    expect(out).toEqual([
      { month: '2026-11', miners: 2, quantity: 25, value: 220 },
      { month: '2026-10', miners: 1, quantity: 10, value: 100 },
    ]);
  });
});
