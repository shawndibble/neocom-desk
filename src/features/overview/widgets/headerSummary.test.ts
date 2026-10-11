import { describe, expect, it } from 'vitest';
import { collectDeadlines, stalestFetch } from './headerSummary';

const d = (at: number) => ({ at, note: 'n', severity: 'clear' as const, to: '/x' });

describe('collectDeadlines', () => {
  it("flattens every view's clocks", () => {
    expect(
      collectDeadlines([{ deadlines: [d(1), d(2)] }, { deadlines: [] }, { deadlines: [d(3)] }])
    ).toEqual([d(1), d(2), d(3)]);
  });
});

describe('stalestFetch', () => {
  it('is the oldest read, with whether any came from cache', () => {
    const old = new Date(1000);
    const fresh = new Date(5000);
    expect(
      stalestFetch([
        { fetchedAt: fresh, fromCache: false },
        { fetchedAt: old, fromCache: true },
        { fetchedAt: null, fromCache: false },
      ])
    ).toEqual({ date: old, fromCache: true });
  });

  it('is null when nothing has been read', () => {
    expect(stalestFetch([{ fetchedAt: null, fromCache: false }])).toEqual({
      date: null,
      fromCache: false,
    });
    expect(stalestFetch([])).toEqual({ date: null, fromCache: false });
  });
});
