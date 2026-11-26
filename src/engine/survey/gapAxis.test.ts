import { HOUR_MS, MINUTE_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import { compressGaps, realTime } from './gapAxis';
import { summarizeSurvey as summarize, type SurveyScan } from './series';

const summarizeSurvey = (scans: SurveyScan[]) => summarize(scans)!;

const T0 = Date.UTC(2026, 10, 20, 0, 35);
const scan = (at: number, volume: number): SurveyScan => ({
  at,
  rocks: [{ ore: 'Bitumens', volume }],
});

const withGaps = () =>
  summarizeSurvey([
    scan(T0, 900),
    scan(T0 + 23 * HOUR_MS, 880),
    ...[0, 10, 20, 30].map((m, i) => scan(T0 + 46 * HOUR_MS + m * MINUTE_MS, 800 - i * 100)),
  ]);

describe('compressGaps', () => {
  it('leaves a survey with steady scans alone', () => {
    const steady = summarizeSurvey([0, 1, 2, 3].map((h) => scan(T0 + h * HOUR_MS, 900 - h * 100)));
    expect(compressGaps(steady)).toBe(steady);
  });

  it('does not break a survey of two far-apart scans (no interval to compare against)', () => {
    const two = summarizeSurvey([scan(T0, 900), scan(T0 + 30 * HOUR_MS, 800)]);
    expect(compressGaps(two)).toBe(two);
  });

  it('does not break a gap under two hours however short the other intervals', () => {
    const s = summarizeSurvey([
      scan(T0, 900),
      scan(T0 + MINUTE_MS, 890),
      scan(T0 + 2 * MINUTE_MS, 880),
      scan(T0 + 90 * MINUTE_MS, 870),
    ]);
    expect(compressGaps(s)).toBe(s);
  });

  it('breaks a long gap even when only one short interval came before it (3 scans)', () => {
    const three = summarizeSurvey([
      scan(T0, 900),
      scan(T0 + 10 * MINUTE_MS, 890),
      scan(T0 + 23 * HOUR_MS, 880),
    ]);
    expect(compressGaps(three).axis?.breaks).toHaveLength(1);
  });

  it('never draws a break wider than the gap it stands for', () => {
    const s = summarizeSurvey([
      scan(T0, 900),
      scan(T0 + 10 * MINUTE_MS, 890),
      scan(T0 + 20 * MINUTE_MS + 2 * HOUR_MS, 880),
      ...Array.from({ length: 40 }, (_, i) =>
        scan(T0 + 3 * HOUR_MS + (i + 1) * 40 * MINUTE_MS, 870 - i)
      ),
    ]);
    const [b] = compressGaps(s).axis!.breaks;
    expect(b.to - b.from).toBeLessThanOrEqual(b.realTo - b.realFrom);
  });

  it('squeezes each long gap to one short break, keeping the scans in order', () => {
    const summary = compressGaps(withGaps());
    const axis = summary.axis!;
    expect(axis.breaks).toHaveLength(2);
    const [a, b] = axis.breaks;
    expect(a.to - a.from).toBeLessThan(HOUR_MS);
    expect(a.to - a.from).toBe(b.to - b.from);
    expect(a.realTo - a.realFrom).toBe(23 * HOUR_MS);
    expect(b.realTo - b.realFrom).toBe(23 * HOUR_MS);
    const times = summary.points.map((p) => p.at);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(times[5] - times[4]).toBe(10 * MINUTE_MS);
    expect(summary.firstAt).toBe(times[0]);
    expect(summary.lastAt).toBe(times[5]);
  });

  it('maps an axis position back to the real time', () => {
    const original = withGaps();
    const summary = compressGaps(original);
    summary.points.forEach((p, i) => {
      expect(summary.axis!.toTime(p.at)).toBe(original.points[i].at);
    });
  });

  it('flags the squeezed intervals and keeps what was measured across them', () => {
    const original = withGaps();
    const summary = compressGaps(original);
    expect(summary.intervals.map((i) => i.gap)).toEqual([
      true,
      true,
      undefined,
      undefined,
      undefined,
    ]);
    expect(summary.intervals[1].mined).toBe(original.intervals[1].mined);
  });

  it('reads a real time through realTime, and an unsqueezed summary as it is', () => {
    const original = withGaps();
    const summary = compressGaps(original);
    expect(realTime(summary, summary.lastAt)).toBe(original.lastAt);
    expect(realTime(original, original.lastAt)).toBe(original.lastAt);
  });

  it('shifts the projected finish by the same amount as the scans', () => {
    const original = withGaps();
    const summary = compressGaps(original);
    expect(summary.etaAt! - summary.lastAt).toBe(original.etaAt! - original.lastAt);
  });

  it('ticks every stretch of scans and names the date where a stretch starts', () => {
    const { axis } = compressGaps(withGaps());
    expect(axis!.ticks.length).toBeGreaterThanOrEqual(3);
    expect(axis!.dateTicks.size).toBe(3);
    for (const t of axis!.dateTicks) expect(axis!.ticks).toContain(t);
  });
});
