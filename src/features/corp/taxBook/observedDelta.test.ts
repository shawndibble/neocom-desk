import { describe, expect, it } from 'vitest';
import {
  OBSERVED_FULL_REFRESH_MS,
  OBSERVED_OVERLAP_MS,
  applyObservedDelta,
  millisOf,
  planObservedRead,
  type ObservedCopyMeta,
} from './observedDelta';
import { BOOK_CACHE_MAX_AGE_MS } from './bookCache';

const NOW = 1_800_000_000_000;
const meta = (over: Partial<ObservedCopyMeta> = {}): ObservedCopyMeta => ({
  version: 'v1',
  checkedAt: NOW - 1000,
  fullAt: NOW - 1000,
  watermark: NOW - 60_000,
  ...over,
});

describe('planObservedRead', () => {
  it('reads everything when nothing is held', () => {
    expect(planObservedRead(undefined, 'v1', NOW)).toEqual({ kind: 'full' });
  });

  it('serves the copy untouched while the stamp matches and the check is young', () => {
    expect(planObservedRead(meta(), 'v1', NOW)).toEqual({ kind: 'cached' });
  });

  it('reads a delta from the watermark, less the overlap, when the stamp moved', () => {
    expect(planObservedRead(meta({ watermark: 1_000_000 }), 'v2', NOW)).toEqual({
      kind: 'delta',
      since: 1_000_000 - OBSERVED_OVERLAP_MS,
    });
  });

  it('reads a delta, not the copy, once the check is older than the cache age', () => {
    const old = meta({ checkedAt: NOW - BOOK_CACHE_MAX_AGE_MS - 1 });
    expect(planObservedRead(old, 'v1', NOW).kind).toBe('delta');
  });

  it('never trusts a missing stamp as a match, but still reads a delta', () => {
    expect(planObservedRead(meta({ version: undefined }), undefined, NOW).kind).toBe('delta');
  });

  it('reads everything when the copy has no watermark to read a delta by', () => {
    expect(planObservedRead(meta({ watermark: null }), 'v2', NOW)).toEqual({ kind: 'full' });
  });

  it('reads everything again once the last full read is a day old, even on a matching stamp', () => {
    const old = meta({ fullAt: NOW - OBSERVED_FULL_REFRESH_MS - 1 });
    expect(planObservedRead(old, 'v1', NOW)).toEqual({ kind: 'full' });
  });

  it('clamps a watermark the clock would put in the future', () => {
    const plan = planObservedRead(meta({ watermark: NOW + 10 * 60_000 }), 'v2', NOW);
    expect(plan).toEqual({ kind: 'delta', since: NOW - OBSERVED_OVERLAP_MS });
  });
});

describe('applyObservedDelta', () => {
  const row = (id: string, quantity: number, updatedMs: number | null) => ({
    id,
    row: { quantity } as never,
    updatedMs,
  });

  it('replaces a row an edit rewrote and adds a new one, keeping the rest', () => {
    const held = [row('a', 1, 10), row('b', 2, 20)];
    const { rows, watermark } = applyObservedDelta(held, [row('b', 5, 30), row('c', 3, 40)], 20);
    expect(rows.map((r) => [r.id, (r.row as { quantity: number }).quantity])).toEqual([
      ['a', 1],
      ['b', 5],
      ['c', 3],
    ]);
    expect(watermark).toBe(40);
  });

  it('keeps the old watermark when the delta is empty', () => {
    expect(applyObservedDelta([row('a', 1, 10)], [], 10).watermark).toBe(10);
  });

  it('never moves the watermark back', () => {
    expect(applyObservedDelta([], [row('a', 1, 5)], 50).watermark).toBe(50);
  });

  it('starts a watermark from the first stamped row, and stays null while none is', () => {
    expect(applyObservedDelta([], [row('a', 1, null)], null).watermark).toBeNull();
    expect(applyObservedDelta([], [row('a', 1, null), row('b', 1, 7)], null).watermark).toBe(7);
  });
});

describe('millisOf', () => {
  it('reads a Firestore Timestamp, a number, and nothing else', () => {
    expect(millisOf({ toMillis: () => 5 })).toBe(5);
    expect(millisOf(6)).toBe(6);
    expect(millisOf(undefined)).toBeNull();
    expect(millisOf('x')).toBeNull();
    expect(millisOf(Number.NaN)).toBeNull();
  });
});
