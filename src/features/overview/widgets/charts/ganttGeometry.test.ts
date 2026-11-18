import { HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import {
  GANTT_LOOK_AHEAD_MS,
  GANTT_LOOK_BACK_MS,
  ganttAxis,
  ganttBar,
  ganttNowPercent,
} from './geometry';

const NOW = 1_000_000_000_000;

describe('ganttAxis', () => {
  it('runs from the earliest start to the latest end', () => {
    const axis = ganttAxis(
      [
        { startMs: NOW - 5 * HOUR_MS, endMs: NOW + 2 * HOUR_MS },
        { startMs: NOW - 1 * HOUR_MS, endMs: NOW + 10 * HOUR_MS },
      ],
      NOW
    );
    expect(axis).toEqual({ from: NOW - 5 * HOUR_MS, to: NOW + 10 * HOUR_MS, now: NOW });
  });

  it('reaches no further back than a day or forward than two weeks', () => {
    const axis = ganttAxis([{ startMs: NOW - 90 * HOUR_MS, endMs: NOW + 30 * 24 * HOUR_MS }], NOW);
    expect(axis.from).toBe(NOW - GANTT_LOOK_BACK_MS);
    expect(axis.to).toBe(NOW + GANTT_LOOK_AHEAD_MS);
  });

  it('always holds now, with an hour ahead of it, even when every job is done', () => {
    const axis = ganttAxis([{ startMs: NOW - 10 * HOUR_MS, endMs: NOW - 2 * HOUR_MS }], NOW);
    expect(axis.from).toBe(NOW - 10 * HOUR_MS);
    expect(axis.to).toBe(NOW + HOUR_MS);
    expect(ganttAxis([], NOW)).toEqual({ from: NOW, to: NOW + HOUR_MS, now: NOW });
  });
});

describe('ganttBar and the now marker', () => {
  const axis = { from: NOW - 4 * HOUR_MS, to: NOW + 16 * HOUR_MS, now: NOW };

  it('places a bar by its share of the axis', () => {
    const bar = ganttBar(NOW, NOW + 10 * HOUR_MS, axis);
    expect(bar).toEqual({ left: 20, width: 50, clippedStart: false, clippedEnd: false });
    expect(ganttNowPercent(axis)).toBe(20);
  });

  it('clamps a job that starts before or ends after the axis and flags the overflow', () => {
    const bar = ganttBar(NOW - 9 * HOUR_MS, NOW + 40 * HOUR_MS, axis);
    expect(bar).toEqual({ left: 0, width: 100, clippedStart: true, clippedEnd: true });
  });

  it('keeps a very short job visible and inside the axis', () => {
    expect(ganttBar(NOW, NOW + 1000, axis).width).toBe(2);
    const atEnd = ganttBar(axis.to, axis.to, axis);
    expect(atEnd.left + atEnd.width).toBeLessThanOrEqual(100);
  });

  it('puts now at the edge when the axis does not cover it', () => {
    expect(ganttNowPercent({ from: NOW + HOUR_MS, to: NOW + 5 * HOUR_MS, now: NOW })).toBe(0);
  });
});
