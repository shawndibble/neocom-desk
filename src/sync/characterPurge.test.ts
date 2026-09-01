import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  purgeCharacterRemoteData,
  purgeCharacterRemoteDataOrDefer,
  remotePurgePendingKey,
  retryPendingRemotePurge,
} from './characterPurge';

interface FakeCol {
  path: string;
}
interface FakeRef {
  col: FakeCol;
  id: string;
}

// In-memory Firestore double: collection path -> doc id -> data. Mirrors the
// one in planSync.test.ts but simpler — this module never filters with
// `where`, matching the uid-only `list`/`delete` rules (firestore.rules).
const fake = vi.hoisted(() => ({
  remoteStore: new Map<string, Map<string, Record<string, unknown>>>(),
}));
const remoteStore = fake.remoteStore;

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_firestore: unknown, ...segments: string[]): FakeCol => ({
    path: segments.join('/'),
  })),
  doc: vi.fn((col: FakeCol, id: string): FakeRef => ({ col, id })),
  getDocs: vi.fn(async (col: FakeCol) => {
    const docs = [...(remoteStore.get(col.path)?.entries() ?? [])].map(([id, data]) => ({
      id,
      data: () => data,
    }));
    return { docs };
  }),
  deleteDoc: vi.fn(async (ref: FakeRef) => {
    remoteStore.get(ref.col.path)?.delete(ref.id);
  }),
}));

vi.mock('./firebaseApp', () => ({ getSyncFirestore: () => ({}) }));

const ensureSignedInMock = vi.fn(async (characterId: number) => `char:${characterId}`);
vi.mock('./syncAuth', () => ({
  ensureSignedIn: (characterId: number) => ensureSignedInMock(characterId),
}));

function seed(characterId: number, collectionName: string, docs: { id: string }[]): void {
  const path = `characters/char:${characterId}/${collectionName}`;
  remoteStore.set(path, new Map(docs.map((d) => [d.id, d])));
}

beforeEach(async () => {
  remoteStore.clear();
  vi.clearAllMocks();
  ensureSignedInMock.mockImplementation(async (characterId: number) => `char:${characterId}`);
  await db.settings.clear();
});

describe('purgeCharacterRemoteData', () => {
  it('deletes every doc across all five Editable Data collections', async () => {
    seed(1, 'plans', [{ id: 'p1' }, { id: 'p2' }]);
    seed(1, 'buildPlans', [{ id: 'b1' }]);
    seed(1, 'quickbars', [{ id: '1' }]);
    seed(1, 'stationPins', [{ id: '1:60003760' }]);
    seed(1, 'settings', [{ id: 'sync.foo' }]);

    await purgeCharacterRemoteData(1);

    expect(remoteStore.get('characters/char:1/plans')?.size).toBe(0);
    expect(remoteStore.get('characters/char:1/buildPlans')?.size).toBe(0);
    expect(remoteStore.get('characters/char:1/quickbars')?.size).toBe(0);
    expect(remoteStore.get('characters/char:1/stationPins')?.size).toBe(0);
    expect(remoteStore.get('characters/char:1/settings')?.size).toBe(0);
  });

  it('does not touch another character’s docs', async () => {
    seed(1, 'plans', [{ id: 'p1' }]);
    seed(2, 'plans', [{ id: 'p2' }]);

    await purgeCharacterRemoteData(1);

    expect(remoteStore.get('characters/char:2/plans')?.size).toBe(1);
  });

  it('propagates a failed sign-in (e.g. a dead refresh token)', async () => {
    ensureSignedInMock.mockRejectedValueOnce(new Error('refresh failed'));
    await expect(purgeCharacterRemoteData(1)).rejects.toThrow('refresh failed');
  });
});

describe('purgeCharacterRemoteDataOrDefer', () => {
  it('purges immediately and returns true when it can sign in', async () => {
    seed(1, 'plans', [{ id: 'p1' }]);

    await expect(purgeCharacterRemoteDataOrDefer(1)).resolves.toBe(true);

    expect(remoteStore.get('characters/char:1/plans')?.size).toBe(0);
    expect(await db.settings.get(remotePurgePendingKey(1))).toBeUndefined();
  });

  it('records a pending marker and returns false when sign-in fails', async () => {
    ensureSignedInMock.mockRejectedValueOnce(new Error('refresh failed'));

    await expect(purgeCharacterRemoteDataOrDefer(1)).resolves.toBe(false);

    expect((await db.settings.get(remotePurgePendingKey(1)))?.value).toBe(true);
  });
});

describe('retryPendingRemotePurge', () => {
  it('is a no-op when nothing is pending', async () => {
    await retryPendingRemotePurge(1);
    expect(ensureSignedInMock).not.toHaveBeenCalled();
  });

  it('retries and clears the marker once sign-in succeeds again', async () => {
    ensureSignedInMock.mockRejectedValueOnce(new Error('refresh failed'));
    await purgeCharacterRemoteDataOrDefer(1);
    seed(1, 'plans', [{ id: 'p1' }]);

    await retryPendingRemotePurge(1);

    expect(remoteStore.get('characters/char:1/plans')?.size).toBe(0);
    expect(await db.settings.get(remotePurgePendingKey(1))).toBeUndefined();

    ensureSignedInMock.mockClear();
    await retryPendingRemotePurge(1);
    expect(ensureSignedInMock).not.toHaveBeenCalled();
  });

  it('leaves the marker in place when the retry still fails', async () => {
    ensureSignedInMock.mockRejectedValue(new Error('still dead'));
    await purgeCharacterRemoteDataOrDefer(1);

    await retryPendingRemotePurge(1);

    expect((await db.settings.get(remotePurgePendingKey(1)))?.value).toBe(true);
  });
});
