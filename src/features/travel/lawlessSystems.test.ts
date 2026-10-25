import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAWLESS_STALE_AFTER_MS } from '@/engine/route/lawless';
import { LAWLESS_R2_URL, loadLawlessSystems, resetLawlessSystemsCache } from './lawlessSystems';

const syncConfigured = vi.hoisted(() => ({ value: false }));
const firestoreDoc = vi.hoisted(() => ({ data: undefined as unknown }));
const ensureAnySession = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ data: () => firestoreDoc.data })),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: vi.fn() }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

describe('loadLawlessSystems', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    syncConfigured.value = false;
    firestoreDoc.data = undefined;
    ensureAnySession.mockClear();
    resetLawlessSystemsCache();
  });

  it('reads R2 with no Firebase session, even when sync is not configured', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ systemIds: [1, 2], updatedAt: Date.now() })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect([...(await loadLawlessSystems(1))]).toEqual([1, 2]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LAWLESS_R2_URL);
    expect(ensureAnySession).not.toHaveBeenCalled();
  });

  it('trusts a fresh empty R2 list over the Firestore doc', async () => {
    syncConfigured.value = true;
    firestoreDoc.data = { systemIds: [9], updatedAt: Date.now() };
    vi.stubGlobal('fetch', async () => Response.json({ systemIds: [], updatedAt: Date.now() }));
    expect((await loadLawlessSystems(1)).size).toBe(0);
    expect(ensureAnySession).not.toHaveBeenCalled();
  });

  it.each([
    ['a 404', () => new Response('', { status: 404 })],
    [
      'a stale copy',
      () => Response.json({ systemIds: [1], updatedAt: Date.now() - LAWLESS_STALE_AFTER_MS - 1 }),
    ],
  ])('falls back to the Firestore doc on %s', async (_name, respond) => {
    syncConfigured.value = true;
    firestoreDoc.data = { systemIds: [9], updatedAt: Date.now() };
    vi.stubGlobal('fetch', async () => respond());
    expect([...(await loadLawlessSystems(1))]).toEqual([9]);
    expect(ensureAnySession).toHaveBeenCalledWith(1);
  });

  it('falls back to the Firestore doc when the fetch throws', async () => {
    syncConfigured.value = true;
    firestoreDoc.data = { systemIds: [9], updatedAt: Date.now() };
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect([...(await loadLawlessSystems(1))]).toEqual([9]);
  });

  it('is empty when R2 fails and sync is not configured', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    expect((await loadLawlessSystems(1)).size).toBe(0);
  });
});
