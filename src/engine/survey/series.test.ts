import { describe, expect, it } from 'vitest';
import { countedScans, summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);

function scan(minutes: number, ...rocks: [string, number][]): SurveyScan {
  return { at: T0 + minutes * MIN, rocks: rocks.map(([ore, volume]) => ({ ore, volume })) };
}

/** A scan whose rocks carry the scanner's ISK value: [ore, volume, isk]. */
function iskScan(minutes: number, ...rocks: [string, number, number][]): SurveyScan {
  return {
    at: T0 + minutes * MIN,
    rocks: rocks.map(([ore, volume, isk]) => ({ ore, volume, isk })),
  };
}

describe('summarizeSurvey', () => {
  it('is null with no scans', () => {
    expect(summarizeSurvey([])).toBeNull();
  });

  it('a single scan has progress 0 and no pace or ETA', () => {
    const s = summarizeSurvey([scan(0, ['Sylvite', 600], ['Bitumens', 400])])!;
    expect(s.startVolume).toBe(1000);
    expect(s.leftVolume).toBe(1000);
    expect(s.percent).toBe(0);
    expect(s.pace).toBeNull();
    expect(s.etaAt).toBeNull();
    expect(s.finished).toBe(false);
  });

  it('computes percent, mined per interval and ETA at the recent pace', () => {
    // 1000 -> 700 over 5 min, then 700 -> 400 over 5 min: 1 m3/s each
    const s = summarizeSurvey([
      scan(0, ['Sylvite', 1000]),
      scan(5, ['Sylvite', 700]),
      scan(10, ['Sylvite', 400]),
    ])!;
    expect(s.percent).toBe(60);
    expect(s.intervals).toEqual([
      { from: T0, to: T0 + 5 * MIN, mined: 300, added: 0, rate: 1 },
      { from: T0 + 5 * MIN, to: T0 + 10 * MIN, mined: 300, added: 0, rate: 1 },
    ]);
    expect(s.pace).toBe(1);
    expect(s.etaAt).toBe(T0 + 10 * MIN + 400 * 1000);
  });

  it('pace is volume-weighted over the last three intervals only', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 10_000]),
      scan(10, ['A', 4_000]), // fast first interval, outside the last three
      scan(11, ['A', 3_940]), // 60 m3 in 60 s
      scan(12, ['A', 3_880]), // 60 m3 in 60 s
      scan(14, ['A', 3_640]), // 240 m3 in 120 s
    ])!;
    expect(s.pace).toBeCloseTo((60 + 60 + 240) / 240, 6);
  });

  it('sorts scans by time and ignores a repeat of the same instant', () => {
    const s = summarizeSurvey([scan(5, ['A', 700]), scan(0, ['A', 1000]), scan(5, ['A', 700])])!;
    expect(s.intervals).toHaveLength(1);
    expect(s.leftVolume).toBe(700);
  });

  it('matches rocks between scans: a shrunk rock is mined, a new rock extends the field', () => {
    // The 500 rock is mined down to 100, and a fresh 300 rock of another ore comes into range.
    const s = summarizeSurvey([
      scan(0, ['A', 500], ['A', 400]),
      scan(5, ['A', 400], ['A', 100], ['B', 300]),
    ])!;
    expect(s.intervals[0]).toMatchObject({ mined: 400, added: 300 });
    expect(s.startVolume).toBe(1200);
    expect(s.leftVolume).toBe(800);
    expect(s.percent).toBe(33);
  });

  it('a rock missing from the next scan counts as mined out', () => {
    const s = summarizeSurvey([scan(0, ['A', 500], ['B', 100]), scan(5, ['A', 500])])!;
    expect(s.intervals[0]).toMatchObject({ mined: 100, added: 0 });
  });

  it('matches within one ore only', () => {
    const s = summarizeSurvey([scan(0, ['A', 500]), scan(5, ['B', 500])])!;
    expect(s.intervals[0]).toMatchObject({ mined: 500, added: 500 });
  });

  it('gives each scan as a point with its volume left per ore', () => {
    const s = summarizeSurvey([scan(0, ['A', 500], ['B', 300]), scan(5, ['A', 400], ['B', 300])])!;
    expect(s.points).toEqual([
      { at: T0, total: 800, byOre: { A: 500, B: 300 } },
      { at: T0 + 5 * MIN, total: 700, byOre: { A: 400, B: 300 } },
    ]);
    expect(s.oreNames).toEqual(['A', 'B']);
  });

  it('falls back to the biggest ISK first when no ore has a unit price, with the value of each ore', () => {
    // Veldspar 20 rocks worth 10M, Scordite 5 rocks worth 25M, Pyroxeres 15 rocks worth 12M.
    const rocks = (ore: string, count: number, each: number): [string, number, number][] =>
      Array.from({ length: count }, () => [ore, 100, each]);
    const s = summarizeSurvey([
      iskScan(
        0,
        ...rocks('Veldspar', 20, 500_000),
        ...rocks('Scordite', 5, 5_000_000),
        ...rocks('Pyroxeres', 15, 800_000)
      ),
    ])!;
    expect(s.ores.map((o) => [o.ore, o.rocks, o.isk])).toEqual([
      ['Scordite', 5, 25_000_000],
      ['Pyroxeres', 15, 12_000_000],
      ['Veldspar', 20, 10_000_000],
    ]);
  });

  it('keeps the volume order for chart layers when the scan has no ISK', () => {
    const s = summarizeSurvey([scan(0, ['Bitumens', 50], ['Sylvite', 500])])!;
    expect(s.oreNames).toEqual(['Sylvite', 'Bitumens']);
  });

  it('lists ores by volume left with rock counts', () => {
    const s = summarizeSurvey([scan(0, ['Bitumens', 50], ['Sylvite', 500], ['Sylvite', 300])])!;
    expect(s.ores).toEqual([
      { ore: 'Sylvite', rocks: 2, volume: 800, isk: 0, startVolume: 800, unitPrice: null },
      { ore: 'Bitumens', rocks: 1, volume: 50, isk: 0, startVolume: 50, unitPrice: null },
    ]);
    expect(s.rocksLeft).toBe(3);
  });

  it('tracks each ore against what the scans first showed of it, mined-out ores last', () => {
    const s = summarizeSurvey([
      scan(0, ['A', 500], ['B', 300], ['C', 200]),
      scan(5, ['A', 250], ['B', 300], ['D', 100]),
    ])!;
    expect(s.ores).toEqual([
      { ore: 'B', rocks: 1, volume: 300, isk: 0, startVolume: 300, unitPrice: null },
      { ore: 'A', rocks: 1, volume: 250, isk: 0, startVolume: 500, unitPrice: null },
      { ore: 'D', rocks: 1, volume: 100, isk: 0, startVolume: 100, unitPrice: null },
      { ore: 'C', rocks: 0, volume: 0, isk: 0, startVolume: 200, unitPrice: null },
    ]);
  });

  it('ignores a scan identical to the one before it: no new data, no idle interval', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 700]), scan(8, ['A', 700])])!;
    expect(s.intervals).toHaveLength(1);
    expect(s.points).toHaveLength(2);
    expect(s.lastAt).toBe(T0 + 5 * MIN);
    expect(s.pace).toBe(1);
  });

  it('ignores a stale repaste of an earlier scan, even with a newer scan in between', () => {
    // A, then B, then A again (a pilot pastes what was still on their clipboard).
    const a: [string, number][] = [
      ['X', 500],
      ['X', 300],
    ];
    const b: [string, number][] = [
      ['X', 500],
      ['X', 200],
    ];
    const s = summarizeSurvey([scan(0, ...a), scan(5, ...b), scan(9, ...a)])!;
    expect(s.points).toHaveLength(2);
    expect(s.lastAt).toBe(T0 + 5 * MIN);
    expect(s.leftVolume).toBe(700);
    expect(s.intervals[0]).toMatchObject({ mined: 100, added: 0 });
  });

  it('reads a scan repasted unchanged as one scan', () => {
    const rocks: [string, number][] = [
      ['A', 400],
      ['A', 300],
      ['B', 200],
    ];
    const s = summarizeSurvey([scan(0, ...rocks), scan(3, ...rocks), scan(6, ...rocks)])!;
    expect(s.points).toHaveLength(1);
    expect(s.pace).toBeNull();
  });

  it('only reads 100% once the field is empty', () => {
    const near = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 2])])!;
    expect(near.percent).toBe(99);
    expect(near.finished).toBe(false);
    const done = summarizeSurvey([scan(0, ['A', 1000]), scan(5)])!;
    expect(done.percent).toBe(100);
    expect(done.finished).toBe(true);
    expect(done.etaAt).toBeNull();
    expect(done.finishedAt).toBe(T0 + 5 * MIN);
    expect(done.elapsedMs).toBe(5 * MIN);
  });

  it('sorts ores and chart layers by market unit price, whatever volume or ISK is in the scans, a mined-out ore keeping its place', () => {
    const prices = new Map([
      ['Veldspar', 20],
      ['Scordite', 90],
      ['Pyroxeres', 40],
      ['Gone', 60],
    ]);
    const s = summarizeSurvey(
      [
        scan(0, ['Veldspar', 100_000], ['Scordite', 10], ['Pyroxeres', 5_000], ['Gone', 800]),
        scan(5, ['Veldspar', 90_000], ['Scordite', 10], ['Pyroxeres', 5_000]),
      ],
      prices
    )!;
    expect(s.oreNames).toEqual(['Scordite', 'Gone', 'Pyroxeres', 'Veldspar']);
    expect(s.ores.map((o) => o.ore)).toEqual(s.oreNames);
    expect(s.ores.find((o) => o.ore === 'Gone')).toMatchObject({ rocks: 0, unitPrice: 60 });
  });

  it('orders ores at one price by name, not by how much is in the paste', () => {
    const s = summarizeSurvey(
      [scan(0, ['Veldspar', 5_000], ['Scordite', 10])],
      new Map([
        ['Veldspar', 20],
        ['Scordite', 20],
      ])
    )!;
    expect(s.oreNames).toEqual(['Scordite', 'Veldspar']);
  });

  it('puts an ore with no price after every priced ore', () => {
    const s = summarizeSurvey(
      [scan(0, ['Odd', 1_000_000], ['Veldspar', 10])],
      new Map([['Veldspar', 20]])
    )!;
    expect(s.oreNames).toEqual(['Veldspar', 'Odd']);
  });
});

describe('countedScans', () => {
  const withId = (id: string, s: SurveyScan): SurveyScan => ({ ...s, id });

  it('drops the scans whose id is ignored and keeps the rest in order', () => {
    const a = withId('a', scan(0, ['Sylvite', 1000]));
    const b = withId('b', scan(5, ['Sylvite', 9]));
    const c = withId('c', scan(10, ['Sylvite', 400]));
    expect(countedScans([a, b, c], new Set(['b']))).toEqual([a, c]);
  });

  it('keeps a scan with no id, which can never be ignored', () => {
    const a = scan(0, ['Sylvite', 1000]);
    expect(countedScans([a], new Set(['a']))).toEqual([a]);
  });

  it('keeps everything when nothing is ignored', () => {
    const a = withId('a', scan(0, ['Sylvite', 1000]));
    expect(countedScans([a], new Set())).toEqual([a]);
  });

  it('leaves a bad paste out of the totals, so the survey reads as if it never came', () => {
    const scans = [
      withId('a', scan(0, ['Sylvite', 1000])),
      withId('bad', scan(2, ['Sylvite', 50_000])),
      withId('c', scan(5, ['Sylvite', 700])),
    ];
    const s = summarizeSurvey(countedScans(scans, new Set(['bad'])))!;
    expect(s.startVolume).toBe(1000);
    expect(s.leftVolume).toBe(700);
    expect(s.percent).toBe(30);
  });
});
