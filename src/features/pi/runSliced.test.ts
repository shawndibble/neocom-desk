import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSliced, SLICE_MS } from './runSliced';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('runSliced', () => {
  it('yields between slices once a slice runs past its budget, and reports what landed', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const seen: number[] = [];
    const slices: [boolean, boolean][] = [];
    runSliced(
      [1, 2, 3],
      (n) => {
        seen.push(n);
        now += SLICE_MS; // every item uses a whole slice
        return n !== 2;
      },
      (landed, done) => slices.push([landed, done])
    );
    expect(seen).toEqual([]);
    vi.runOnlyPendingTimers();
    expect(seen).toEqual([1]);
    vi.runOnlyPendingTimers();
    vi.runOnlyPendingTimers();
    expect(seen).toEqual([1, 2, 3]);
    expect(slices).toEqual([
      [true, false],
      [false, false],
      [true, true],
    ]);
  });

  it('stops when cancelled', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const seen: number[] = [];
    const cancel = runSliced(
      [1, 2],
      (n) => {
        seen.push(n);
        now += SLICE_MS;
      },
      () => {}
    );
    vi.runOnlyPendingTimers();
    cancel();
    vi.advanceTimersByTime(10);
    expect(seen).toEqual([1]);
  });
});
