import { describe, expect, it } from 'vitest';
import { parseSurveyScan } from './parseScan';
import { summarizeSurvey } from './series';

// Two real Survey Scanner copies of one ice mine, taken a few minutes apart.
const FIRST = [
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km',
  'Clear Icicle\t29\t29,000 m3\t5,940,000.00 ISK\t7,222 m',
  'Clear Icicle\t38\t38,000 m3\t7,790,000.00 ISK\t7,459 m',
  'Clear Icicle\t48\t48,000 m3\t9,840,000.00 ISK\t8,246 m',
  'Clear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km',
].join('\n');
const SECOND = [
  'Clear Icicle\t3\t3,000 m3\t615,000.00 ISK\t7,222 m',
  'Clear Icicle\t25\t25,000 m3\t5,120,000.00 ISK\t28 km',
  'Clear Icicle\t38\t38,000 m3\t7,790,000.00 ISK\t7,459 m',
  'Clear Icicle\t48\t48,000 m3\t9,840,000.00 ISK\t8,246 m',
  'Clear Icicle\t55\t55,000 m3\t11,300,000.00 ISK\t10 km',
].join('\n');

describe('two real scans of one ice mine', () => {
  it('reads the rock at 7,222 m as the one that was mined down from 29 units to 3', () => {
    const t0 = Date.UTC(2026, 9, 8, 18, 0, 0);
    const scans = [
      { at: t0, rocks: parseSurveyScan(FIRST)! },
      { at: t0 + 10 * 60_000, rocks: parseSurveyScan(SECOND)! },
    ];
    const s = summarizeSurvey(scans)!;
    expect(s.intervals[0]).toMatchObject({ mined: 26_000, added: 0 });
    expect(s.startVolume).toBe(195_000);
    expect(s.leftVolume).toBe(169_000);
    expect(s.percent).toBe(13);
    expect(s.pace).toBeCloseTo(26_000 / 600, 6);
    expect(s.rocksLeft).toBe(5);
    // The scanner's own ISK column, summed: 615,000 + 5,120,000 + 7,790,000 + 9,840,000 + 11,300,000.
    expect(s.iskLeft).toBe(34_665_000);
  });
});
