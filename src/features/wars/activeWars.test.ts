import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_WARS_R2_URL,
  ACTIVE_WARS_STALE_AFTER_MS,
  freshActiveWars,
  loadActiveWars,
  resetActiveWarsCache,
} from './activeWars';

const syncConfigured = vi.hoisted(() => ({ value: false }));
const firestoreDoc = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ data: () => firestoreDoc.data })),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: vi.fn() }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => {}) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

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
    syncConfigured.value = false;
    resetActiveWarsCache();
  });

  it('reads the list from R2 with no Firebase session', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      Response.json({ updatedAt: Date.now(), wars: [war], url })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadActiveWars(1)).toEqual([war]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ACTIVE_WARS_R2_URL);
  });

  it('reads R2 even when sync is not configured, and again only after the window', async () => {
    const fetchMock = vi.fn(async () => Response.json({ updatedAt: Date.now(), wars: [war] }));
    vi.stubGlobal('fetch', fetchMock);
    await loadActiveWars(1);
    await loadActiveWars(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['404', () => new Response('', { status: 404 })],
    ['malformed', () => Response.json({ nope: true })],
  ])('falls through to Firestore when R2 answers %s', async (_name, answer) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer())
    );
    // Sync is off, so the Firestore fallback is skipped: no wars, no throw.
    expect(await loadActiveWars(1)).toEqual([]);
  });

  it('falls through when the R2 fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline')))
    );
    expect(await loadActiveWars(1)).toEqual([]);
  });

  it('reads the Firestore doc when R2 has no list yet and sync is configured', async () => {
    syncConfigured.value = true;
    firestoreDoc.data = { updatedAt: Date.now(), wars: [war] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    expect(await loadActiveWars(1)).toEqual([war]);
  });
});
