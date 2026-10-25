import { describe, expect, it } from 'vitest';
import {
  availableChartViews,
  depletionSeries,
  iskSeries,
  paceShareSeries,
  rateByOreSeries,
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
      rows: [],
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

  it('gives an interval where nothing was mined no shares and no progress', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 100]),
      scan(5, ['A', 100], ['B', 50]), // B appears: added, nothing mined
      scan(10, ['A', 50], ['B', 50]),
    ])!;
    const [idle] = paceShareSeries(s).intervals;
    expect(idle.shares).toEqual({});
    expect(idle.progress).toBe(0);
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
    expect(i.percents).toEqual({ B: 100 });
    expect(i.shares).toEqual({ B: 100 });
    expect(i.progress).toBeCloseTo(100);
  });

  it('reports no progress when the summary has no starting volume (hand-built summary)', () => {
    const base = summarizeSurvey([scan(0, ['A', 100]), scan(5, ['A', 50])])!;
    const [i] = paceShareSeries({ ...base, startVolume: 0 }).intervals;
    expect(i.progress).toBe(0);
  });

  it('clamps progress to 100 (hand-built summary)', () => {
    const base = summarizeSurvey([scan(0, ['A', 100]), scan(5, ['A', 50])])!;
    const [i] = paceShareSeries({ ...base, startVolume: 10 }).intervals;
    expect(i.progress).toBe(100);
  });

  it('plots rows at each interval start, middle and 1 ms before its end, then a tail row', () => {
    const s = summarizeSurvey([scan(0, ['A', 100]), scan(10, ['A', 50]), scan(20, ['A', 20])])!;
    const { rows } = paceShareSeries(s);
    expect(rows).toEqual([
      { at: T0, interval: 0, idle: 0 },
      { at: T0 + 5 * MIN, interval: 0, idle: 0 },
      { at: T0 + 10 * MIN - 1, interval: 0, idle: 0 },
      { at: T0 + 10 * MIN, interval: 1, idle: 0 },
      { at: T0 + 15 * MIN, interval: 1, idle: 0 },
      { at: T0 + 20 * MIN - 1, interval: 1, idle: 0 },
      { at: T0 + 20 * MIN, interval: -1, idle: 0 },
    ]);
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

describe('rateByOreSeries', () => {
  it('is empty before a second scan', () => {
    const s = summarizeSurvey([scan(0, ['A', 100])])!;
    expect(rateByOreSeries(s)).toEqual({
      intervals: [],
      rows: [],
      activeOres: [],
      toneIndex: { A: 0 },
    });
  });

  it('splits each interval rate into m3/s per mined ore, summing to the total', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 1000], ['B', 500]),
      scan(5, ['A', 700], ['B', 400]), // 300 + 100 m3 over 300 s
    ])!;
    const { intervals, activeOres, toneIndex } = rateByOreSeries(s);
    expect(activeOres).toEqual(['A', 'B']);
    expect(toneIndex).toEqual({ A: 0, B: 1 });
    const [i] = intervals;
    expect(i.rates.A).toBeCloseTo(1);
    expect(i.rates.B).toBeCloseTo(1 / 3);
    expect(i.rate).toBeCloseTo(s.intervals[0].rate);
    expect(i.rates.A + i.rates.B).toBeCloseTo(i.rate);
  });

  it('leaves an ore out of an interval it was not mined in, and out of activeOres when never mined', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 100], ['B', 100], ['C', 100]),
      scan(5, ['A', 50], ['B', 100], ['C', 100]),
      scan(10, ['A', 50], ['B', 40], ['C', 100]),
    ])!;
    const { intervals, activeOres } = rateByOreSeries(s);
    expect(Object.keys(intervals[0].rates)).toEqual(['A']);
    expect(Object.keys(intervals[1].rates)).toEqual(['B']);
    expect(activeOres).toEqual(['A', 'B']);
  });

  it('gives every row each active ore so the stack lines up, 0 where it was not mined', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 100], ['B', 100]),
      scan(5, ['A', 40], ['B', 100]),
      scan(10, ['A', 40], ['B', 70]),
    ])!;
    const { rows } = rateByOreSeries(s);
    const t5 = T0 + 5 * MIN;
    const t10 = T0 + 10 * MIN;
    expect(rows.map((r) => [r.at, r.interval])).toEqual([
      [T0, 0],
      [(T0 + t5) / 2, 0],
      [t5 - 1, 0],
      [t5, 1],
      [(t5 + t10) / 2, 1],
      [t10 - 1, 1],
      [t10, -1],
    ]);
    expect(rows[0]).toMatchObject({ A: 0.2, B: 0, total: 0.2 });
    expect(rows[3]).toMatchObject({ A: 0, B: 0.1, total: 0.1 });
    // The tail row closes the last step at the last scan with its values; no tooltip there.
    expect(rows[6]).toMatchObject({ A: 0, B: 0.1, total: 0.1 });
  });
});
