import { beforeEach, describe, expect, it, vi } from 'vitest';
import { purgeCharacterRemoteData } from './remotePurge';
import { REMOTE_COLLECTION_NAMES } from './syncedCollections';

interface FakeCol {
  path: string;
}
interface FakeRef {
  col: FakeCol;
  id: string;
}

// In-memory Firestore double: collection path -> doc id -> data. No `where`:
// the uid-only `list`/`delete` rules (firestore.rules) need no ownerHash filter.
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

beforeEach(() => {
  remoteStore.clear();
  vi.clearAllMocks();
  ensureSignedInMock.mockImplementation(async (characterId: number) => `char:${characterId}`);
});

describe('purgeCharacterRemoteData', () => {
  it.each(REMOTE_COLLECTION_NAMES)('deletes every doc in the %s collection', async (name) => {
    seed(1, name, [{ id: 'a' }, { id: 'b' }]);

    await purgeCharacterRemoteData(1);

    expect(remoteStore.get(`characters/char:1/${name}`)?.size).toBe(0);
  });

  it('does not touch another character’s docs', async () => {
    seed(1, 'plans', [{ id: 'p1' }]);
    seed(2, 'plans', [{ id: 'p2' }]);

    await purgeCharacterRemoteData(1);

    expect(remoteStore.get('characters/char:2/plans')?.size).toBe(1);
  });

  it('propagates a failed sign-in (e.g. a dead refresh token)', async () => {
    seed(1, 'plans', [{ id: 'p1' }]);
    ensureSignedInMock.mockRejectedValueOnce(new Error('refresh failed'));

    await expect(purgeCharacterRemoteData(1)).rejects.toThrow('refresh failed');
    expect(remoteStore.get('characters/char:1/plans')?.size).toBe(1);
  });
});
