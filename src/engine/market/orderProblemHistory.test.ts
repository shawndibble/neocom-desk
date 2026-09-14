import { describe, it, expect } from 'vitest';
import {
  DEFAULT_UNDERCUT_HISTORY_THRESHOLDS,
  MAX_SAMPLES_PER_ORDER,
  appendOrderProblemSample,
  sampledProblem,
  wasFrequentlyUndercut,
  type OrderProblemSample,
} from './orderProblemHistory';
import type { OrderProblem } from './orderProblems';

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

/** `count` samples ending at `NOW`, one per hour, all of `problem`. */
function run(count: number, problem: OrderProblem, from = NOW): OrderProblemSample[] {
  return Array.from({ length: count }, (_, i) => ({ at: from - (count - 1 - i) * HOUR, problem }));
}

describe('wasFrequentlyUndercut', () => {
  it('is false with too few samples, even when every one of them is undercut', () => {
    const samples = run(DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.minSamples - 1, 'undercutStation');
    expect(wasFrequentlyUndercut(samples, NOW)).toBe(false);
  });

  it('is false for an order with no samples at all', () => {
    expect(wasFrequentlyUndercut([], NOW)).toBe(false);
  });

  it('is true once a majority of in-window samples were undercut', () => {
    const samples = [...run(6, 'healthy', NOW - 7 * HOUR), ...run(7, 'undercutStation')];
    expect(samples.length).toBeGreaterThanOrEqual(DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.minSamples);
    expect(wasFrequentlyUndercut(samples, NOW)).toBe(true);
  });

  it('is false when undercut samples are exactly half — a majority is required', () => {
    const samples = [...run(6, 'healthy', NOW - 6 * HOUR), ...run(6, 'undercutRegion')];
    expect(wasFrequentlyUndercut(samples, NOW)).toBe(false);
  });

  it('counts a buy order’s `outbid` as the undercut state', () => {
    expect(wasFrequentlyUndercut(run(12, 'outbid'), NOW)).toBe(true);
  });

  it('does not count `belowFloor` or `expiringOrStale` as undercut', () => {
    expect(wasFrequentlyUndercut(run(12, 'belowFloor'), NOW)).toBe(false);
    expect(wasFrequentlyUndercut(run(12, 'expiringOrStale'), NOW)).toBe(false);
  });

  it('ignores samples older than the window, and falls back to "too few" when that empties it', () => {
    const old = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.windowMs + HOUR;
    const samples = run(20, 'undercutStation', NOW - old);
    expect(wasFrequentlyUndercut(samples, NOW)).toBe(false);
  });

  it('judges only the in-window slice when the history straddles the window edge', () => {
    const outside = run(
      20,
      'undercutStation',
      NOW - DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.windowMs - HOUR
    );
    const inside = run(12, 'healthy');
    expect(wasFrequentlyUndercut([...outside, ...inside], NOW)).toBe(false);
  });
});

describe('sampledProblem', () => {
  it('records the undercut scope even when `belowFloor` outranks it', () => {
    expect(sampledProblem(['belowFloor', 'undercutStation'])).toBe('undercutStation');
  });

  it('records `outbid` even when a worse-ranked problem sits beside it', () => {
    expect(sampledProblem(['outbid', 'expiringOrStale'])).toBe('outbid');
  });

  it('keeps the worst problem when no undercut state applies', () => {
    expect(sampledProblem(['belowFloor', 'expiringOrStale'])).toBe('belowFloor');
  });

  it('falls back to healthy for an empty set', () => {
    expect(sampledProblem([])).toBe('healthy');
  });
});

describe('appendOrderProblemSample', () => {
  it('appends the first sample', () => {
    expect(appendOrderProblemSample([], { at: NOW, problem: 'healthy' })).toEqual([
      { at: NOW, problem: 'healthy' },
    ]);
  });

  it('replaces the last sample when a re-read of the same load reclassifies it', () => {
    const existing: OrderProblemSample[] = [
      { at: NOW - HOUR, problem: 'healthy' },
      { at: NOW, problem: 'healthy' },
    ];
    expect(appendOrderProblemSample(existing, { at: NOW, problem: 'undercutRegion' })).toEqual([
      { at: NOW - HOUR, problem: 'healthy' },
      { at: NOW, problem: 'undercutRegion' },
    ]);
  });

  it('rewrites nothing when the same load re-reads an unchanged classification', () => {
    const existing: OrderProblemSample[] = [{ at: NOW, problem: 'healthy' }];
    expect(appendOrderProblemSample(existing, { at: NOW, problem: 'healthy' })).toBe(existing);
  });

  it('drops a sample taken sooner than the minimum spacing after the last one', () => {
    const existing: OrderProblemSample[] = [{ at: NOW, problem: 'healthy' }];
    const tooSoon = { at: NOW + 1000, problem: 'undercutStation' } as const;
    expect(appendOrderProblemSample(existing, tooSoon)).toBe(existing);
  });

  it('appends once the minimum spacing has passed', () => {
    const existing: OrderProblemSample[] = [{ at: NOW, problem: 'healthy' }];
    const later = {
      at: NOW + DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.minSpacingMs,
      problem: 'undercutStation' as const,
    };
    expect(appendOrderProblemSample(existing, later)).toEqual([...existing, later]);
  });

  it('drops samples that have fallen out of the window', () => {
    const stale: OrderProblemSample[] = [
      { at: NOW - DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.windowMs - HOUR, problem: 'healthy' },
      { at: NOW - HOUR, problem: 'healthy' },
    ];
    expect(appendOrderProblemSample(stale, { at: NOW, problem: 'healthy' })).toEqual([
      { at: NOW - HOUR, problem: 'healthy' },
      { at: NOW, problem: 'healthy' },
    ]);
  });

  it('caps the stored history, keeping the newest samples', () => {
    const full = Array.from({ length: MAX_SAMPLES_PER_ORDER }, (_, i) => ({
      at: NOW - (MAX_SAMPLES_PER_ORDER - i) * DEFAULT_UNDERCUT_HISTORY_THRESHOLDS.minSpacingMs,
      problem: 'healthy' as const,
    }));
    const next = appendOrderProblemSample(full, { at: NOW, problem: 'undercutStation' });
    expect(next).toHaveLength(MAX_SAMPLES_PER_ORDER);
    expect(next[next.length - 1]).toEqual({ at: NOW, problem: 'undercutStation' });
    expect(next[0]).toEqual(full[1]);
  });
});
