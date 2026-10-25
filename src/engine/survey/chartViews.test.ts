import { describe, expect, it } from 'vitest';
import { availableChartViews, depletionSeries, iskSeries, paceByOreSeries } from './chartViews';
import { summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);

/** A scan whose rocks carry ISK: [ore, volume, isk]. */
function iskScan(minutes: number, ...rocks: [string, number, number][]): SurveyScan {
  return {
    at: T0 + minutes * MIN,
    rocks: rocks.map(([ore, volume, isk]) => ({ ore, volume, isk })),
  };
}
function scan(minutes: number, ...rocks: [string, number][]): SurveyScan {
  return { at: T0 + minutes * MIN, rocks: rocks.map(([ore, volume]) => ({ ore, volume })) };
}

const PRICES = new Map([['A', 10]]);

describe('availableChartViews', () => {
  it('offers ore and depletion always, isk when an ore has a unit price and ISK is known', () => {
    const s = summarizeSurvey([iskScan(0, ['A', 100, 1000]), iskScan(5, ['A', 50, 500])], PRICES)!;
    expect(availableChartViews(s)).toEqual(['ore', 'depletion', 'isk']);
  });

  it('hides isk when nothing is priced', () => {
    const s = summarizeSurvey([iskScan(0, ['A', 100, 1000]), iskScan(5, ['A', 50, 500])])!;
    expect(availableChartViews(s)).toEqual(['ore', 'depletion']);
  });

  it('hides isk when no row carried ISK even if an ore has a price', () => {
    const s = summarizeSurvey([scan(0, ['A', 100]), scan(5, ['A', 50])], PRICES)!;
    expect(availableChartViews(s)).toEqual(['ore', 'depletion']);
  });
});

describe('depletionSeries', () => {
  it('gives each ore its volume left as a percent of its own start, and all ore as a total', () => {
    const s = summarizeSurvey([scan(0, ['A', 100], ['B', 300]), scan(5, ['A', 50], ['B', 300])])!;
    expect(depletionSeries(s)).toEqual([
      { at: T0, all: 100, A: 100, B: 100 },
      { at: T0 + 5 * MIN, all: (350 / 400) * 100, A: 50, B: 100 },
    ]);
  });

  it('an ore mined out reads 0%', () => {
    const s = summarizeSurvey([scan(0, ['A', 100], ['B', 300]), scan(5, ['B', 300])])!;
    expect(depletionSeries(s)[1]).toMatchObject({ A: 0, B: 100 });
  });

  it('an ore not yet shown is omitted so its line starts at its first scan', () => {
    // B first appears in scan 2 (came into range); its start volume is 200.
    const s = summarizeSurvey([
      scan(0, ['A', 100]),
      scan(5, ['A', 80], ['B', 200]),
      scan(10, ['A', 80], ['B', 100]),
    ])!;
    const rows = depletionSeries(s);
    expect('B' in rows[0]).toBe(false);
    expect(rows[1]).toMatchObject({ A: 80, B: 100 });
    expect(rows[2]).toMatchObject({ B: 50 });
  });

  it('keeps an ore that was shown and later gone at 0, not omitted', () => {
    const s = summarizeSurvey([scan(0, ['A', 100], ['B', 50]), scan(5, ['A', 100])])!;
    expect(depletionSeries(s)[1].B).toBe(0);
  });

  it('clamps to 0..100 (a later rock for an ore can grow its volume past its start)', () => {
    const s = summarizeSurvey([scan(0, ['A', 100]), scan(5, ['A', 100], ['A', 100])])!;
    // startVolume counts the added rock, so this stays <= 100; clamp guards float drift.
    for (const row of depletionSeries(s)) {
      expect(row.A as number).toBeLessThanOrEqual(100);
      expect(row.A as number).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('iskSeries', () => {
  const survey = () =>
    summarizeSurvey(
      [iskScan(0, ['A', 100, 1000], ['B', 100, 300]), iskScan(5, ['A', 50, 500], ['B', 100, 300])],
      PRICES
    )!;

  it('drops an unpriced ore from the stack and lists it apart', () => {
    const r = iskSeries(survey());
    expect(r.pricedOres).toEqual(['A']);
    expect(r.unpricedOres).toEqual(['B']);
    expect(r.rows[0]).toEqual({ at: T0, total: 1000, A: 1000 });
    expect('B' in r.rows[1]).toBe(false);
  });

  it('carries ISK mined since the previous scan on later rows', () => {
    const r = iskSeries(survey());
    expect(r.rows[0].minedIsk).toBeUndefined();
    expect(r.rows[1].minedIsk).toBeCloseTo(500, 6);
  });

  it("keeps each ore's colour index from oreNames, whatever is dropped", () => {
    const s = summarizeSurvey(
      [
        iskScan(0, ['A', 100, 1000], ['B', 100, 300], ['C', 100, 200]),
        iskScan(5, ['A', 90, 900], ['B', 90, 270], ['C', 90, 180]),
      ],
      new Map([
        ['A', 10],
        ['C', 2],
      ])
    )!;
    const r = iskSeries(s);
    expect(s.oreNames).toEqual(['A', 'C', 'B']);
    expect(r.toneIndex).toEqual({ A: 0, C: 1, B: 2 });
    expect(r.pricedOres).toEqual(['A', 'C']);
  });

  it("adds a projected run to zero at the ETA, from the last scan's total", () => {
    const s = survey();
    expect(s.etaAt).not.toBeNull();
    const r = iskSeries(s);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[1].projected).toBe(r.rows[1].total);
    expect(r.rows[2]).toEqual({ at: s.etaAt, projected: 0 });
  });

  it('has no projection without an ETA', () => {
    const s = summarizeSurvey([iskScan(0, ['A', 100, 1000])], PRICES)!;
    const r = iskSeries(s);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].projected).toBeUndefined();
  });
});

describe('paceByOreSeries', () => {
  it('is empty before a second scan', () => {
    const s = summarizeSurvey([scan(0, ['A', 100])])!;
    expect(paceByOreSeries(s)).toEqual({ rows: [], activeOres: [], toneIndex: { A: 0 } });
  });

  it('gives each interval a step per ore in m3/s that sums to the total pace', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 1000], ['B', 500]),
      scan(5, ['A', 700], ['B', 400]), // 300 s: A 1, B 1/3
      scan(15, ['A', 700], ['B', 100]), // 600 s: B 0.5
    ])!;
    const { rows, activeOres, toneIndex } = paceByOreSeries(s);
    expect(activeOres).toEqual(['A', 'B']);
    expect(toneIndex).toEqual({ A: 0, B: 1 });
    expect(rows).toHaveLength(3);
    expect(rows[0].at).toBe(T0);
    expect(rows[0].A).toBeCloseTo(1);
    expect(rows[0].B).toBeCloseTo(1 / 3);
    expect(rows[0].total).toBeCloseTo(4 / 3);
    // an ore not being mined adds zero height
    expect(rows[1].A).toBe(0);
    expect(rows[1].B).toBeCloseTo(0.5);
    expect(rows[1].total).toBeCloseTo(0.5);
    // closing row repeats the last step at the last scan
    expect(rows[2].at).toBe(T0 + 15 * MIN);
    expect(rows[2].B).toBeCloseTo(0.5);
  });

  it('keeps the colour index of the full ore list and drops ores never mined', () => {
    const s = summarizeSurvey(
      [scan(0, ['A', 100], ['B', 100], ['C', 100]), scan(1, ['A', 100], ['B', 100], ['C', 40])],
      new Map([
        ['A', 3],
        ['B', 2],
        ['C', 1],
      ])
    )!;
    const { activeOres, toneIndex } = paceByOreSeries(s);
    expect(activeOres).toEqual(['C']);
    expect(toneIndex.C).toBe(2);
  });
});
