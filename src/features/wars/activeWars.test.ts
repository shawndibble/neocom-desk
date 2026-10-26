import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_WARS_R2_URL,
  ACTIVE_WARS_STALE_AFTER_MS,
  freshActiveWars,
  loadActiveWars,
  resetActiveWarsCache,
} from './activeWars';

const NOW = Date.UTC(2026, 9, 21, 12);
const war = {
  id: 1,
  declared: NOW - 1000,
  mutual: false,
  openForAllies: false,
  aggressor: { corporationId: 1, iskDestroyed: 0, shipsKilled: 0 },
  defender: { corporationId: 2, iskDestroyed: 0, shipsKilled: 0 },
  allies: [],
};

describe('freshActiveWars', () => {
  it('returns the wars of a recent list', () => {
    expect(freshActiveWars({ updatedAt: NOW - 1000, wars: [war] }, NOW)).toEqual([war]);
  });

  it('hides a list the sweep has stopped refreshing', () => {
    const doc = { updatedAt: NOW - ACTIVE_WARS_STALE_AFTER_MS - 1, wars: [war] };
    expect(freshActiveWars(doc, NOW)).toEqual([]);
  });

  it('is empty for a missing or malformed doc', () => {
    expect(freshActiveWars(undefined, NOW)).toEqual([]);
    expect(freshActiveWars({ wars: [war] }, NOW)).toEqual([]);
  });
});

describe('loadActiveWars', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetActiveWarsCache();
  });

  it('reads the list from R2 with no Firebase session', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json({ updatedAt: Date.now(), wars: [war], url })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadActiveWars()).toEqual([war]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ACTIVE_WARS_R2_URL);
  });

  it('reads R2 again only after the window', async () => {
    const fetchMock = vi.fn(async () => Response.json({ updatedAt: Date.now(), wars: [war] }));
    vi.stubGlobal('fetch', fetchMock);
    await loadActiveWars();
    await loadActiveWars();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['404', () => new Response('', { status: 404 })],
    ['malformed', () => Response.json({ nope: true })],
  ])('is empty when R2 answers %s', async (_name, answer) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer())
    );
    expect(await loadActiveWars()).toEqual([]);
  });

  it('is empty when the R2 fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    );
    expect(await loadActiveWars()).toEqual([]);
  });

  it('is empty when the R2 list is stale', async () => {
    const stale = { updatedAt: Date.now() - ACTIVE_WARS_STALE_AFTER_MS - 1, wars: [war] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(stale))
    );
    expect(await loadActiveWars()).toEqual([]);
  });

  it('keeps the last list when a later read fails, and retries on the next call', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ updatedAt: Date.now(), wars: [war] }))
      .mockResolvedValue(new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    try {
      await loadActiveWars();
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(await loadActiveWars()).toEqual([war]);
      await loadActiveWars();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
