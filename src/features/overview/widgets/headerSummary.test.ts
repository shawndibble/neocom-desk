import { describe, expect, it } from 'vitest';
import { anyStillLoading, collectDeadlines, fetchBreakdown, stalestFetch } from './headerSummary';

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

describe('fetchBreakdown', () => {
  const view = (at: number | null) => ({ fetchedAt: at === null ? null : new Date(at) });

  it('lists each kind once, stalest first, with unread kinds last', () => {
    const rows = fetchBreakdown([
      { kind: 'wallet', view: view(5000) },
      { kind: 'assets', view: view(1000) },
      { kind: 'orders', view: view(null) },
      { kind: 'wallet', view: view(5000) },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['assets', 'wallet', 'orders']);
    expect(rows[0]).toEqual({ kind: 'assets', fetchedAt: new Date(1000) });
    expect(rows[2].fetchedAt).toBeNull();
  });

  it('is empty with nothing drawn', () => {
    expect(fetchBreakdown([])).toEqual([]);
    // The first widget of a kind names the row, Show included.
    expect(
      fetchBreakdown([
        { kind: 'wallet', show: 'flow', view: { fetchedAt: null } },
        { kind: 'wallet', view: { fetchedAt: null } },
      ])
    ).toEqual([{ kind: 'wallet', show: 'flow', fetchedAt: null }]);
  });
});

describe('anyStillLoading', () => {
  const status = (over: Partial<Parameters<typeof anyStillLoading>[0][number]['status']>) => ({
    status: {
      loading: false,
      needsPermission: false,
      error: false,
      hasData: true,
      isEmpty: false,
      ...over,
    },
  });

  it('is true while a view has nothing to show yet', () => {
    expect(anyStillLoading([status({}), status({ loading: true, hasData: false })])).toBe(true);
  });

  it('is false once every view has data, failed or lacks permission', () => {
    expect(
      anyStillLoading([
        status({}),
        status({ loading: true }),
        status({ error: true, hasData: false }),
        status({ needsPermission: true, hasData: false }),
      ])
    ).toBe(false);
    expect(anyStillLoading([])).toBe(false);
  });
});
