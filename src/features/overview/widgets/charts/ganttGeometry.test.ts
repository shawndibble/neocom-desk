import { describe, expect, it } from 'vitest';
import {
  GANTT_LOOK_AHEAD_MS,
  GANTT_LOOK_BACK_MS,
  ganttAxis,
  ganttBar,
  ganttNowPercent,
} from './geometry';

const NOW = 1_000_000_000_000;
const H = 3_600_000;

describe('ganttAxis', () => {
  it('runs from the earliest start to the latest end', () => {
    const axis = ganttAxis(
      [
        { startMs: NOW - 5 * H, endMs: NOW + 2 * H },
        { startMs: NOW - 1 * H, endMs: NOW + 10 * H },
      ],
      NOW
    );
    expect(axis).toEqual({ from: NOW - 5 * H, to: NOW + 10 * H, now: NOW });
  });

  it('reaches no further back than a day or forward than two weeks', () => {
    const axis = ganttAxis([{ startMs: NOW - 90 * H, endMs: NOW + 30 * 24 * H }], NOW);
    expect(axis.from).toBe(NOW - GANTT_LOOK_BACK_MS);
    expect(axis.to).toBe(NOW + GANTT_LOOK_AHEAD_MS);
  });

  it('always holds now, with an hour ahead of it, even when every job is done', () => {
    const axis = ganttAxis([{ startMs: NOW - 10 * H, endMs: NOW - 2 * H }], NOW);
    expect(axis.from).toBe(NOW - 10 * H);
    expect(axis.to).toBe(NOW + H);
    expect(ganttAxis([], NOW)).toEqual({ from: NOW, to: NOW + H, now: NOW });
  });
});

describe('ganttBar and the now marker', () => {
  const axis = { from: NOW - 4 * H, to: NOW + 16 * H, now: NOW };

  it('places a bar by its share of the axis', () => {
    const bar = ganttBar(NOW, NOW + 10 * H, axis);
    expect(bar).toEqual({ left: 20, width: 50, clippedStart: false, clippedEnd: false });
    expect(ganttNowPercent(axis)).toBe(20);
  });

  it('clamps a job that starts before or ends after the axis and flags the overflow', () => {
    const bar = ganttBar(NOW - 9 * H, NOW + 40 * H, axis);
    expect(bar).toEqual({ left: 0, width: 100, clippedStart: true, clippedEnd: true });
  });

  it('keeps a very short job visible and inside the axis', () => {
    expect(ganttBar(NOW, NOW + 1000, axis).width).toBe(2);
    const atEnd = ganttBar(axis.to, axis.to, axis);
    expect(atEnd.left + atEnd.width).toBeLessThanOrEqual(100);
  });

  it('puts now at the edge when the axis does not cover it', () => {
    expect(ganttNowPercent({ from: NOW + H, to: NOW + 5 * H, now: NOW })).toBe(0);
  });
});
