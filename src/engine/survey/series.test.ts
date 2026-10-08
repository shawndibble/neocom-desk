import { describe, expect, it } from 'vitest';
import { summarizeSurvey, type SurveyScan } from './series';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 8, 16, 40, 0);

function scan(minutes: number, ...rocks: [string, number][]): SurveyScan {
  return { at: T0 + minutes * MIN, rocks: rocks.map(([ore, volume]) => ({ ore, volume })) };
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
      { from: T0, to: T0 + 5 * MIN, mined: 300, rate: 1 },
      { from: T0 + 5 * MIN, to: T0 + 10 * MIN, mined: 300, rate: 1 },
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

  it('a scan showing more ore than before gives no negative interval', () => {
    const s = summarizeSurvey([scan(0, ['A', 1000]), scan(5, ['A', 1100])])!;
    expect(s.intervals[0].mined).toBe(0);
    expect(s.pace).toBeNull();
    expect(s.etaAt).toBeNull();
  });

  it('lists ores by volume left with rock counts', () => {
    const s = summarizeSurvey([scan(0, ['Bitumens', 50], ['Sylvite', 500], ['Sylvite', 300])])!;
    expect(s.ores).toEqual([
      { ore: 'Sylvite', rocks: 2, volume: 800 },
      { ore: 'Bitumens', rocks: 1, volume: 50 },
    ]);
    expect(s.rocksLeft).toBe(3);
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
});
