import { describe, expect, it } from 'vitest';
import {
  availableChartViews,
  depletionSeries,
  iskSeries,
  PACE_FADE_FLOOR,
  paceFade,
  paceShareSeries,
} from './chartViews';
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

describe('paceShareSeries', () => {
  it('is empty before a second scan', () => {
    const s = summarizeSurvey([scan(0, ['A', 100])])!;
    expect(paceShareSeries(s)).toEqual({
      intervals: [],
      activeOres: [],
      toneIndex: { A: 0 },
    });
  });

  it('keeps each ore percent of its own start, and turns them into shares summing to 100', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 1000], ['B', 500]),
      scan(5, ['A', 700], ['B', 400]), // A 30%, B 20%
    ])!;
    const { intervals, activeOres, toneIndex } = paceShareSeries(s);
    expect(activeOres).toEqual(['A', 'B']);
    expect(toneIndex).toEqual({ A: 0, B: 1 });
    const [i] = intervals;
    expect(i.percents.A).toBeCloseTo(30);
    expect(i.percents.B).toBeCloseTo(20);
    expect(i.shares.A).toBeCloseTo(60);
    expect(i.shares.B).toBeCloseTo(40);
    expect(i.shares.A + i.shares.B).toBeCloseTo(100);
  });

  it('measures progress as m3 mined over the whole starting volume', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 1000], ['B', 500]),
      scan(5, ['A', 700], ['B', 400]), // 400 of 1500 m3
    ])!;
    expect(paceShareSeries(s).intervals[0].progress).toBeCloseTo((400 / 1500) * 100);
  });

  it('leaves an idle ore out of an interval and out of activeOres when never mined', () => {
    const s = summarizeSurvey([scan(0, ['A', 100], ['B', 100]), scan(5, ['A', 50], ['B', 100])])!;
    const { intervals, activeOres } = paceShareSeries(s);
    expect('B' in intervals[0].percents).toBe(false);
    expect('B' in intervals[0].shares).toBe(false);
    expect(intervals[0].shares.A).toBeCloseTo(100);
    expect(activeOres).toEqual(['A']);
  });

  it('gives an interval where nothing was mined no shares, no progress and the floor opacity', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 100]),
      scan(5, ['A', 100], ['B', 50]), // B appears: added, nothing mined
      scan(10, ['A', 50], ['B', 50]),
    ])!;
    const [idle, busy] = paceShareSeries(s).intervals;
    expect(idle.shares).toEqual({});
    expect(idle.progress).toBe(0);
    expect(idle.opacity).toBe(PACE_FADE_FLOOR);
    expect(busy.opacity).toBe(1);
  });

  it('measures an ore that came into range later against its own start volume', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 100]),
      scan(5, ['A', 100], ['B', 200]),
      scan(10, ['A', 100], ['B', 150]),
    ])!;
    const startB = s.ores.find((o) => o.ore === 'B')!.startVolume;
    expect(paceShareSeries(s).intervals[1].percents.B).toBeCloseTo((50 / startB) * 100);
  });

  it('skips an ore with no start volume and clamps a percent over 100 (hand-built summary)', () => {
    const base = summarizeSurvey([scan(0, ['A', 100], ['B', 100]), scan(5, ['A', 50], ['B', 50])])!;
    const s = {
      ...base,
      ores: base.ores.map((o) =>
        o.ore === 'A' ? { ...o, startVolume: 0 } : { ...o, startVolume: 10 }
      ),
    };
    const [i] = paceShareSeries(s).intervals;
    expect('A' in i.percents).toBe(false);
    expect(i.percents.B).toBe(100);
    expect(i.shares).toEqual({ B: 100 });
  });

  it('never divides by zero through a real survey', () => {
    const s = summarizeSurvey([scan(0, ['A', 0], ['B', 100]), scan(5, ['A', 0], ['B', 0])])!;
    const [i] = paceShareSeries(s).intervals;
    expect(i.shares.B).toBeCloseTo(100);
    expect(Number.isFinite(i.progress)).toBe(true);
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
    const { activeOres, toneIndex } = paceShareSeries(s);
    expect(activeOres).toEqual(['C']);
    expect(toneIndex.C).toBe(2);
  });
});

describe('paceFade', () => {
  it('runs from the floor at nothing to 1 at the busiest interval, linearly', () => {
    expect(paceFade(0, 10)).toBe(PACE_FADE_FLOOR);
    expect(paceFade(10, 10)).toBe(1);
    expect(paceFade(5, 10)).toBeCloseTo((PACE_FADE_FLOOR + 1) / 2);
  });

  it('is never below the floor or above 1, and is 1 when nothing was ever mined', () => {
    expect(paceFade(-3, 10)).toBe(PACE_FADE_FLOOR);
    expect(paceFade(20, 10)).toBe(1);
    expect(paceFade(0, 0)).toBe(1);
  });
});
