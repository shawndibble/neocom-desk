/**
 * The public snapshot readers only need *a* Firebase session, and must never
 * swap the one an alt's sync pass is using (issue #2262). Each reader runs
 * against the real `sync/syncAuth` here, with only Firebase itself faked, so a
 * reader that went back to `ensureSignedIn(active)` would re-sign-in as the
 * active Character and fail these.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signInWithCustomToken } from 'firebase/auth';
import { db } from '@/db';
import { resetRevalidationState } from '@/esi/cache';
import { loadHubSnapshotRange } from './market/hubSnapshot';
import { loadPublicBpcContracts } from './bpcContracts/syncedContracts';
import { loadChunkedSnapshot } from './contractSearch/chunkedSnapshot';

const getDocs = vi.hoisted(() => vi.fn());
const fakeAuth = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));

vi.mock('firebase/firestore/lite', () => ({
  getDocs,
  collection: (_db: unknown, name: string) => ({ name }),
  query: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  startAt: (...args: unknown[]) => args,
  endAt: (...args: unknown[]) => args,
  documentId: () => '__name__',
}));
vi.mock('firebase/auth', () => ({
  signInWithCustomToken: vi.fn(async () => {
    const user = { uid: 'char:1' };
    fakeAuth.currentUser = user;
    return { user };
  }),
  signOut: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: { token: 't', uid: 'char:1', ownerHash: 'h' } }),
}));
vi.mock('@/auth/session', () => ({ getValidAccessToken: vi.fn(async () => 'eve-token') }));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncAuth: () => fakeAuth,
  getSyncFirestore: () => ({}),
  getSyncFunctions: () => ({}),
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const ACTIVE_CHARACTER_ID = 1;
const ALT_UID = 'char:2';

beforeEach(async () => {
  await db.esiCache.clear();
  resetRevalidationState();
  vi.mocked(signInWithCustomToken).mockClear();
  getDocs.mockReset();
  getDocs.mockResolvedValue({ docs: [] });
  // An alt's sync pass holds the one session slot.
  fakeAuth.currentUser = { uid: ALT_UID };
});

describe('snapshot readers while an alt sync holds the session', () => {
  it.each([
    [
      'hub market history',
      () => loadHubSnapshotRange(ACTIVE_CHARACTER_ID, '2026-09-24', '2026-09-24'),
    ],
    ['public BPC contracts', () => loadPublicBpcContracts(ACTIVE_CHARACTER_ID)],
    [
      'chunked snapshot',
      () =>
        loadChunkedSnapshot(
          {
            collectionName: 'publicCourierContracts',
            cacheKey: 'publicCourierContracts',
            staleAfterMs: 60_000,
          },
          ACTIVE_CHARACTER_ID
        ),
    ],
  ])('%s reads under the alt session without changing the current user', async (_name, read) => {
    await read();

    expect(getDocs).toHaveBeenCalled();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    expect(fakeAuth.currentUser?.uid).toBe(ALT_UID);
  });
});
