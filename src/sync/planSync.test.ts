import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, getDocs, setDoc } from 'firebase/firestore';
import { db, type SkillPlanRecord } from '@/db';
import { TOMBSTONE_TTL_MS } from './merge';
import {
  markPlanDeleted,
  scheduleSync,
  setSyncedSetting,
  subscribeSyncStatus,
  triggerSync,
  type SyncStatus,
} from './planSync';

type DocData = Record<string, unknown>;

// In-memory Firestore double: collection path -> doc id -> data.
const remoteStore = vi.hoisted(() => new Map<string, Map<string, DocData>>());

interface FakeCol {
  path: string;
}
interface FakeRef {
  col: FakeCol;
  id: string;
}

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_firestore: unknown, ...segments: string[]): FakeCol => ({
    path: segments.join('/'),
  })),
  doc: vi.fn((col: FakeCol, id: string): FakeRef => ({ col, id })),
  getDocs: vi.fn(async (col: FakeCol) => ({
    docs: [...(remoteStore.get(col.path)?.values() ?? [])].map((data) => ({ data: () => data })),
  })),
  setDoc: vi.fn(async (ref: FakeRef, data: DocData) => {
    let colMap = remoteStore.get(ref.col.path);
    if (!colMap) {
      colMap = new Map();
      remoteStore.set(ref.col.path, colMap);
    }
    colMap.set(ref.id, data);
  }),
  deleteDoc: vi.fn(async (ref: FakeRef) => {
    remoteStore.get(ref.col.path)?.delete(ref.id);
  }),
}));

vi.mock('./firebaseApp', () => ({
  getSyncFirestore: () => ({}),
}));

vi.mock('./syncAuth', () => ({
  ensureSignedIn: vi.fn(async (characterId: number) => `char:${characterId}`),
  uidForCharacter: (characterId: number) => `char:${characterId}`,
}));

const PLANS_PATH = 'characters/char:1/plans';
const SETTINGS_PATH = 'characters/char:1/settings';
const HASH = 'hash-a';

function plan(overrides: Partial<SkillPlanRecord> = {}): SkillPlanRecord {
  return {
    id: 'p1',
    characterId: 1,
    name: 'Frigates V',
    entries: [{ skillTypeID: 3327, targetLevel: 5 }],
    remapCount: 1,
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function remoteDoc(overrides: DocData = {}): DocData {
  return { ...plan(), ownerHash: HASH, deleted: false, ...overrides };
}

function seedRemote(path: string, docs: DocData[]): void {
  remoteStore.set(path, new Map(docs.map((d) => [String(d.id ?? d.key), d])));
}

beforeEach(async () => {
  remoteStore.clear();
  vi.clearAllMocks();
  await Promise.all([db.characters.clear(), db.skillPlans.clear(), db.settings.clear()]);
  await db.characters.put({ characterId: 1, name: 'Pilot', ownerHash: HASH, addedAt: 1 });
});

describe('triggerSync: plans', () => {
  it('pushes a local-only plan with ownerHash and deleted: false', async () => {
    const p = plan();
    await db.skillPlans.put(p);
    await triggerSync(1);
    expect(remoteStore.get(PLANS_PATH)?.get('p1')).toEqual({
      id: 'p1',
      characterId: 1,
      name: p.name,
      entries: p.entries,
      remapCount: p.remapCount,
      updatedAt: p.updatedAt,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('pulls a remote-only plan into Dexie without remote-only fields', async () => {
    const expected = plan();
    seedRemote(PLANS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.skillPlans.get('p1')).toEqual(expected);
  });

  it('LWW: newer local overwrites remote, newer remote overwrites local', async () => {
    const now = Date.now();
    await db.skillPlans.bulkPut([
      plan({ id: 'localWins', name: 'local', updatedAt: now - 10 }),
      plan({ id: 'remoteWins', name: 'stale-local', updatedAt: now - 900 }),
    ]);
    seedRemote(PLANS_PATH, [
      remoteDoc({ id: 'localWins', name: 'stale-remote', updatedAt: now - 900 }),
      remoteDoc({ id: 'remoteWins', name: 'remote', updatedAt: now - 10 }),
    ]);
    await triggerSync(1);
    expect(remoteStore.get(PLANS_PATH)?.get('localWins')?.name).toBe('local');
    expect((await db.skillPlans.get('remoteWins'))?.name).toBe('remote');
  });

  it('markPlanDeleted pushes a tombstone and clears the local one after sync', async () => {
    await db.skillPlans.put(plan());
    seedRemote(PLANS_PATH, [remoteDoc()]);
    await markPlanDeleted(1, 'p1'); // also schedules a debounced sync
    expect(await db.skillPlans.get('p1')).toBeUndefined();

    await triggerSync(1); // cancels the pending debounce and syncs now
    const doc = remoteStore.get(PLANS_PATH)?.get('p1');
    expect(doc?.deleted).toBe(true);
    expect(doc?.ownerHash).toBe(HASH);
    const tombstones = await db.settings.get('sync.__tombstones.1');
    expect(tombstones?.value).toEqual([]);
  });

  it('a remote tombstone deletes the local plan', async () => {
    await db.skillPlans.put(plan({ updatedAt: Date.now() - 5000 }));
    seedRemote(PLANS_PATH, [remoteDoc({ deleted: true, updatedAt: Date.now() - 100 })]);
    await triggerSync(1);
    expect(await db.skillPlans.get('p1')).toBeUndefined();
  });

  it('purges remote tombstones older than 30 days', async () => {
    seedRemote(PLANS_PATH, [
      remoteDoc({ deleted: true, updatedAt: Date.now() - TOMBSTONE_TTL_MS - 60_000 }),
    ]);
    await triggerSync(1);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(remoteStore.get(PLANS_PATH)?.has('p1')).toBe(false);
  });

  it('wipes local plans instead of pushing them when ownerHash changed (character sold)', async () => {
    await db.settings.put({ key: 'sync.__ownerHash.1', value: 'previous-owner-hash' });
    await db.skillPlans.put(plan());
    await triggerSync(1);
    expect(await db.skillPlans.count()).toBe(0);
    expect(remoteStore.get(PLANS_PATH)?.get('p1')).toBeUndefined();
    expect((await db.settings.get('sync.__ownerHash.1'))?.value).toBe(HASH);
  });
});

describe('triggerSync: settings', () => {
  it('pushes synced settings with timestamp and ownerHash', async () => {
    await setSyncedSetting('sync.tradeHub', 'jita');
    await triggerSync(1);
    const doc = remoteStore.get(SETTINGS_PATH)?.get('sync.tradeHub');
    expect(doc).toMatchObject({ key: 'sync.tradeHub', value: 'jita', ownerHash: HASH });
    expect(typeof doc?.updatedAt).toBe('number');
  });

  it('pulls newer remote settings into Dexie', async () => {
    seedRemote(SETTINGS_PATH, [
      { key: 'sync.tradeHub', value: 'amarr', updatedAt: Date.now() + 60_000, ownerHash: HASH },
    ]);
    await setSyncedSetting('sync.tradeHub', 'jita');
    await triggerSync(1);
    expect((await db.settings.get('sync.tradeHub'))?.value).toBe('amarr');
  });

  it('never syncs internal sync.__ bookkeeping keys', async () => {
    await db.settings.put({ key: 'sync.__tombstones.1', value: [] });
    await triggerSync(1);
    expect(remoteStore.get(SETTINGS_PATH)?.get('sync.__tombstones.1')).toBeUndefined();
  });

  it('rejects setSyncedSetting keys without the sync. prefix', async () => {
    await expect(setSyncedSetting('theme', 'dark')).rejects.toThrow(/sync\./);
  });
});

describe('sync orchestration', () => {
  it('reports syncing -> idle with lastSyncedAt via subscribeSyncStatus', async () => {
    const states: SyncStatus[] = [];
    const unsubscribe = subscribeSyncStatus((s) => states.push(s));
    await triggerSync(1);
    unsubscribe();
    expect(states.some((s) => s.state === 'syncing')).toBe(true);
    const last = states[states.length - 1];
    expect(last.state).toBe('idle');
    expect(last.lastSyncedAt).not.toBeNull();
  });

  it('reports an error state when sync fails', async () => {
    const states: SyncStatus[] = [];
    const unsubscribe = subscribeSyncStatus((s) => states.push(s));
    await expect(triggerSync(999)).rejects.toThrow(/Unknown character/);
    unsubscribe();
    expect(states[states.length - 1].state).toBe('error');
    expect(states[states.length - 1].error).toMatch(/Unknown character/);
  });

  it('debounces scheduleSync into a single run', async () => {
    scheduleSync(1, 20);
    scheduleSync(1, 20);
    scheduleSync(1, 20);
    // One sync = one getDocs per collection (plans + settings).
    await vi.waitFor(() => expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 100)); // no extra runs
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });
});
