import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, getDocs, setDoc, where } from 'firebase/firestore/lite';
import { db, type BuildPlanRecord, type SkillPlanRecord } from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { CACHE_PURGE_PENDING_PREFIX } from '@/esi/cachePurge';
import { TOMBSTONE_TTL_MS } from './merge';
import {
  deleteSyncedSetting,
  getSyncStatus,
  markBuildPlanDeleted,
  markPlanDeleted,
  scheduleSync,
  setSyncedSetting,
  subscribeSyncStatus,
  triggerSync,
  type SyncStatus,
} from './planSync';
import type { SyncedSettingTombstone } from './merge';

type DocData = Record<string, unknown>;

interface FakeCol {
  path: string;
}
interface FakeFilter {
  field: string;
  op: string;
  value: unknown;
}
interface FakeQuery {
  col: FakeCol;
  filters: FakeFilter[];
}
interface FakeRef {
  col: FakeCol;
  id: string;
}

// In-memory Firestore double: collection path -> doc id -> data. getDocs applies
// '==' where-filters like the real backend, and like the deployed rules, which
// only allow filtered list queries.
const fake = vi.hoisted(() => {
  const remoteStore = new Map<string, Map<string, Record<string, unknown>>>();
  const getDocsImpl = async (target: {
    path?: string;
    col?: { path: string };
    filters?: { field: string; op: string; value: unknown }[];
  }) => {
    const path = target.col?.path ?? target.path ?? '';
    const filters = target.filters ?? [];
    const docs = [...(remoteStore.get(path)?.values() ?? [])]
      .filter((d) => filters.every((f) => (f.op === '==' ? d[f.field] === f.value : true)))
      .map((data) => ({ data: () => data }));
    return { docs };
  };
  return { remoteStore, getDocsImpl };
});
const remoteStore = fake.remoteStore;

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_firestore: unknown, ...segments: string[]): FakeCol => ({
    path: segments.join('/'),
  })),
  doc: vi.fn((col: FakeCol, id: string): FakeRef => ({ col, id })),
  query: vi.fn((col: FakeCol, ...filters: FakeFilter[]): FakeQuery => ({ col, filters })),
  where: vi.fn((field: string, op: string, value: unknown): FakeFilter => ({ field, op, value })),
  getDocs: vi.fn(fake.getDocsImpl),
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

// Real implementation by default — only the outcome is overridden per test,
// so the purge/spare-global assertions elsewhere still exercise real Dexie.
vi.mock('@/esi/cachePurge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/esi/cachePurge')>();
  return { ...actual, purgeCharacterCacheOrSuppress: vi.fn(actual.purgeCharacterCacheOrSuppress) };
});

vi.mock('./firebaseApp', () => ({
  getSyncFirestore: () => ({}),
}));

vi.mock('./syncAuth', () => ({
  ensureSignedIn: vi.fn(async (characterId: number) => `char:${characterId}`),
  uidForCharacter: (characterId: number) => `char:${characterId}`,
}));

const PLANS_PATH = 'characters/char:1/plans';
const BUILD_PLANS_PATH = 'characters/char:1/buildPlans';
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

function buildPlan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'b1',
    characterId: 1,
    name: 'Rifter run',
    blueprintTypeID: 638,
    runs: 10,
    me: 10,
    te: 20,
    facility: 'raitaru',
    rigLevel: 't1',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function remoteDoc(overrides: DocData = {}): DocData {
  return { ...plan(), ownerHash: HASH, deleted: false, ...overrides };
}

function remoteBuildDoc(overrides: DocData = {}): DocData {
  return { ...buildPlan(), ownerHash: HASH, deleted: false, ...overrides };
}

function seedRemote(path: string, docs: DocData[]): void {
  remoteStore.set(path, new Map(docs.map((d) => [String(d.id ?? d.key), d])));
}

const SETTINGS_META_KEY = 'sync.__settingsMeta';
const SETTINGS_TOMBSTONES_KEY = 'sync.__settingsTombstones';

// Seed a synced setting locally as if setSyncedSetting had written it. The
// allow-list is empty in production, so tests can't call setSyncedSetting;
// planSync tolerates keys written outside it (a real device that synced before
// a key was removed from the allow-list is in exactly this state).
async function seedLocalSetting(
  key: string,
  value: unknown,
  updatedAt = Date.now()
): Promise<void> {
  await db.settings.put({ key, value });
  const meta = ((await db.settings.get(SETTINGS_META_KEY))?.value ?? {}) as Record<string, number>;
  await db.settings.put({ key: SETTINGS_META_KEY, value: { ...meta, [key]: updatedAt } });
}

async function readLocalSettingsTombstones(): Promise<SyncedSettingTombstone[]> {
  const record = await db.settings.get(SETTINGS_TOMBSTONES_KEY);
  return Array.isArray(record?.value) ? (record.value as SyncedSettingTombstone[]) : [];
}

beforeEach(async () => {
  remoteStore.clear();
  vi.clearAllMocks();
  vi.mocked(getDocs).mockImplementation(fake.getDocsImpl as never);
  await Promise.all([
    db.characters.clear(),
    db.skillPlans.clear(),
    db.buildPlans.clear(),
    db.settings.clear(),
    db.esiCache.clear(),
  ]);
  await db.characters.put({ characterId: 1, name: 'Pilot', ownerHash: HASH, addedAt: 1 });
});

describe('markers field mapping', () => {
  it('round-trips plan markers through push and pull', async () => {
    await db.skillPlans.add(plan({ markers: [1, 3] }));
    await triggerSync(1);
    const remote = remoteStore.get(PLANS_PATH)?.get('p1');
    expect(remote?.markers).toEqual([1, 3]);

    await db.skillPlans.delete('p1');
    seedRemote(PLANS_PATH, [remoteDoc({ markers: [1, 3], updatedAt: Date.now() + 1000 })]);
    await triggerSync(1);
    const local = await db.skillPlans.get('p1');
    expect(local?.markers).toEqual([1, 3]);
  });

  it('omits markers key entirely when undefined (Firestore rejects undefined)', async () => {
    await db.skillPlans.add(plan());
    await triggerSync(1);
    const remote = remoteStore.get(PLANS_PATH)?.get('p1');
    expect(remote && 'markers' in remote).toBe(false);
  });
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

  it('wipes the character ESI cache when ownerHash changed, sparing global rows', async () => {
    // The previous owner's cached wallet/mail/assets must not survive into the
    // new owner's session. GLOBAL_CACHE_CHARACTER_ID rows are public universe
    // data owned by nobody — purging them would be churn with no benefit.
    await db.settings.put({ key: 'sync.__ownerHash.1', value: 'previous-owner-hash' });
    await db.esiCache.bulkPut([
      { characterId: 1, key: 'wallet:journal', value: 'secret', fetchedAt: 1 },
      { characterId: 1, key: 'mail:headers', value: 'secret', fetchedAt: 1 },
      { characterId: 2, key: 'wallet:journal', value: 'other char', fetchedAt: 1 },
      { characterId: GLOBAL_CACHE_CHARACTER_ID, key: 'type:587', value: 'Rifter', fetchedAt: 1 },
    ]);

    await triggerSync(1);

    const remaining = (await db.esiCache.toArray()).map((r) => `${r.characterId}:${r.key}`).sort();
    expect(remaining).toEqual(['0:type:587', '2:wallet:journal']);
  });

  it('leaves the ESI cache alone when ownerHash is unchanged', async () => {
    await db.settings.put({ key: 'sync.__ownerHash.1', value: HASH });
    await db.esiCache.put({ characterId: 1, key: 'wallet:journal', value: 'mine', fetchedAt: 1 });

    await triggerSync(1);

    expect(await db.esiCache.count()).toBe(1);
  });

  it('leaves the ESI cache alone on a first-ever sync (no recorded ownerHash)', async () => {
    await db.esiCache.put({ characterId: 1, key: 'wallet:journal', value: 'mine', fetchedAt: 1 });

    await triggerSync(1);

    expect(await db.esiCache.count()).toBe(1);
  });

  it('wipes local plans instead of pushing them when ownerHash changed (character sold)', async () => {
    await db.settings.put({ key: 'sync.__ownerHash.1', value: 'previous-owner-hash' });
    await db.skillPlans.put(plan());
    await db.buildPlans.put(buildPlan());
    await triggerSync(1);
    expect(await db.skillPlans.count()).toBe(0);
    expect(await db.buildPlans.count()).toBe(0);
    expect(remoteStore.get(PLANS_PATH)?.get('p1')).toBeUndefined();
    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')).toBeUndefined();
    expect((await db.settings.get('sync.__ownerHash.1'))?.value).toBe(HASH);
  });

  it('leaves the ownerHash bookmark unadvanced when the purge only reached suppression', async () => {
    // Suppression can be memory-only, so advancing the bookmark would burn the
    // last retry: after a reload the marker is gone, the hash matches and the
    // previous owner's rows read normally again.
    const purge = vi.mocked(await import('@/esi/cachePurge')).purgeCharacterCacheOrSuppress;
    purge.mockResolvedValueOnce('suppressed');
    await db.settings.put({ key: 'sync.__ownerHash.1', value: 'previous-owner-hash' });
    await db.skillPlans.put(plan());

    await triggerSync(1);

    expect(await db.skillPlans.count()).toBe(0);
    expect((await db.settings.get('sync.__ownerHash.1'))?.value).toBe('previous-owner-hash');
  });

  it('advances the bookmark when the purge succeeded', async () => {
    const purge = vi.mocked(await import('@/esi/cachePurge')).purgeCharacterCacheOrSuppress;
    purge.mockResolvedValueOnce('targeted');
    await db.settings.put({ key: 'sync.__ownerHash.1', value: 'previous-owner-hash' });

    await triggerSync(1);

    expect((await db.settings.get('sync.__ownerHash.1'))?.value).toBe(HASH);
  });
});

describe('triggerSync: ownerHash-scoped reads', () => {
  it('queries every collection filtered by the character ownerHash', async () => {
    await triggerSync(1);
    // plans + buildPlans + settings, each read through a where clause.
    expect(vi.mocked(where)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(where)).toHaveBeenCalledWith('ownerHash', '==', HASH);
    for (const call of vi.mocked(getDocs).mock.calls) {
      expect(call[0]).toMatchObject({ filters: [{ field: 'ownerHash', op: '==', value: HASH }] });
    }
  });

  it('ignores remote docs written under a different ownerHash', async () => {
    seedRemote(PLANS_PATH, [remoteDoc({ id: 'stale', ownerHash: 'previous-owner' })]);
    await triggerSync(1);
    expect(await db.skillPlans.get('stale')).toBeUndefined();
  });
});

describe('triggerSync: build plans', () => {
  it('pushes a local-only build plan with ownerHash and deleted: false', async () => {
    const p = buildPlan({ facilityTaxPct: 1.5 });
    await db.buildPlans.put(p);
    await triggerSync(1);
    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')).toEqual({
      id: 'b1',
      characterId: 1,
      name: p.name,
      blueprintTypeID: p.blueprintTypeID,
      runs: p.runs,
      me: p.me,
      te: p.te,
      facility: p.facility,
      rigLevel: p.rigLevel,
      security: p.security,
      hubId: p.hubId,
      facilityTaxPct: 1.5,
      updatedAt: p.updatedAt,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('omits undefined facilityTaxPct from the pushed doc (Firestore rejects undefined)', async () => {
    await db.buildPlans.put(buildPlan());
    await triggerSync(1);
    const doc = remoteStore.get(BUILD_PLANS_PATH)?.get('b1');
    expect(doc).toBeDefined();
    expect('facilityTaxPct' in (doc ?? {})).toBe(false);
  });

  it('pulls a remote-only build plan into Dexie without remote-only fields', async () => {
    const expected = buildPlan();
    seedRemote(BUILD_PLANS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.buildPlans.get('b1')).toEqual(expected);
  });

  it('LWW: newer remote build plan overwrites local', async () => {
    const now = Date.now();
    await db.buildPlans.put(buildPlan({ runs: 1, updatedAt: now - 900 }));
    seedRemote(BUILD_PLANS_PATH, [remoteBuildDoc({ runs: 50, updatedAt: now - 10 })]);
    await triggerSync(1);
    expect((await db.buildPlans.get('b1'))?.runs).toBe(50);
  });

  it('markBuildPlanDeleted pushes a tombstone and clears the local one after sync', async () => {
    await db.buildPlans.put(buildPlan());
    seedRemote(BUILD_PLANS_PATH, [remoteBuildDoc()]);
    await markBuildPlanDeleted(1, 'b1');
    expect(await db.buildPlans.get('b1')).toBeUndefined();

    await triggerSync(1);
    const doc = remoteStore.get(BUILD_PLANS_PATH)?.get('b1');
    expect(doc?.deleted).toBe(true);
    expect(doc?.ownerHash).toBe(HASH);
    const tombstones = await db.settings.get('sync.__buildTombstones.1');
    expect(tombstones?.value).toEqual([]);
  });

  it('a remote tombstone deletes the local build plan', async () => {
    await db.buildPlans.put(buildPlan({ updatedAt: Date.now() - 5000 }));
    seedRemote(BUILD_PLANS_PATH, [remoteBuildDoc({ deleted: true, updatedAt: Date.now() - 100 })]);
    await triggerSync(1);
    expect(await db.buildPlans.get('b1')).toBeUndefined();
  });
});

describe('triggerSync: settings', () => {
  it('pushes synced settings with timestamp and ownerHash', async () => {
    await seedLocalSetting('sync.tradeHub', 'jita');
    await triggerSync(1);
    const doc = remoteStore.get(SETTINGS_PATH)?.get('sync.tradeHub');
    expect(doc).toMatchObject({ key: 'sync.tradeHub', value: 'jita', ownerHash: HASH });
    expect(typeof doc?.updatedAt).toBe('number');
  });

  it('never pushes the device-local cache-purge-pending marker', async () => {
    // A stuck purge is one device's storage problem; syncing the marker would
    // suppress the ESI cache on every other device. Not being a 'sync.' key is
    // what keeps it local.
    await db.settings.put({ key: `${CACHE_PURGE_PENDING_PREFIX}1`, value: true });
    // Seeded rather than written through setSyncedSetting: this test is about
    // the purge marker staying local, not about the synced-key allow-list.
    await seedLocalSetting('sync.tradeHub', 'jita');

    await triggerSync(1);

    expect(remoteStore.get(SETTINGS_PATH)?.has(`${CACHE_PURGE_PENDING_PREFIX}1`)).toBe(false);
    expect(remoteStore.get(SETTINGS_PATH)?.has('sync.tradeHub')).toBe(true);
  });

  it('pulls newer remote settings into Dexie', async () => {
    seedRemote(SETTINGS_PATH, [
      { key: 'sync.tradeHub', value: 'amarr', updatedAt: Date.now() + 60_000, ownerHash: HASH },
    ]);
    await seedLocalSetting('sync.tradeHub', 'jita');
    await triggerSync(1);
    expect((await db.settings.get('sync.tradeHub'))?.value).toBe('amarr');
  });

  it('never writes a remote setting with a non-synced key into Dexie', async () => {
    // A hostile/compromised remote doc must not overwrite arbitrary Dexie keys.
    seedRemote(SETTINGS_PATH, [
      { key: 'activeCharacterId', value: 999, updatedAt: Date.now() + 60_000, ownerHash: HASH },
      {
        key: 'sync.__tombstones.1',
        value: 'junk',
        updatedAt: Date.now() + 60_000,
        ownerHash: HASH,
      },
    ]);
    await triggerSync(1);
    expect(await db.settings.get('activeCharacterId')).toBeUndefined();
    expect(await db.settings.get('sync.__tombstones.1')).toBeUndefined();
  });

  it('never syncs internal sync.__ bookkeeping keys', async () => {
    await db.settings.put({ key: 'sync.__tombstones.1', value: [] });
    await triggerSync(1);
    expect(remoteStore.get(SETTINGS_PATH)?.get('sync.__tombstones.1')).toBeUndefined();
  });

  it('rejects setSyncedSetting keys without the sync. prefix', async () => {
    await expect(setSyncedSetting('theme', 'dark')).rejects.toThrow(/sync\./);
  });

  it('rejects setSyncedSetting keys that are not on the allow-list', async () => {
    await expect(setSyncedSetting('sync.tradeHub', 'jita')).rejects.toThrow(/allow-list/);
  });

  it('deleteSyncedSetting removes the Dexie row and its meta entry', async () => {
    await seedLocalSetting('sync.tradeHub', 'jita', 1_000);
    await deleteSyncedSetting('sync.tradeHub');
    expect(await db.settings.get('sync.tradeHub')).toBeUndefined();
    const meta = (await db.settings.get(SETTINGS_META_KEY))?.value as Record<string, number>;
    expect('sync.tradeHub' in meta).toBe(false);
    expect(await readLocalSettingsTombstones()).toEqual([
      { key: 'sync.tradeHub', deletedAt: expect.any(Number) },
    ]);
  });

  it('deleteSyncedSetting propagates a tombstone to remote and keeps the local one', async () => {
    // The local tombstone survives a successful push: it is the only defense
    // against a stale device re-pushing its pre-delete copy once the remote
    // tombstone ages past TOMBSTONE_TTL_MS and gets purged. It clears only
    // once a remote write is observed postdating the delete (see merge.ts).
    await seedLocalSetting('sync.tradeHub', 'jita', Date.now() - 5_000);
    seedRemote(SETTINGS_PATH, [
      { key: 'sync.tradeHub', value: 'jita', updatedAt: Date.now() - 5_000, ownerHash: HASH },
    ]);
    await deleteSyncedSetting('sync.tradeHub');

    await triggerSync(1);
    const doc = remoteStore.get(SETTINGS_PATH)?.get('sync.tradeHub');
    expect(doc?.deleted).toBe(true);
    expect(doc?.ownerHash).toBe(HASH);
    expect('value' in (doc ?? {})).toBe(false);
    expect(await readLocalSettingsTombstones()).toEqual([
      { key: 'sync.tradeHub', deletedAt: expect.any(Number) },
    ]);
  });

  it('a remote settings tombstone deletes the local setting on the next sync', async () => {
    await seedLocalSetting('sync.tradeHub', 'jita', Date.now() - 5_000);
    seedRemote(SETTINGS_PATH, [
      { key: 'sync.tradeHub', updatedAt: Date.now() - 100, ownerHash: HASH, deleted: true },
    ]);
    await triggerSync(1);
    expect(await db.settings.get('sync.tradeHub')).toBeUndefined();
    const meta = (await db.settings.get(SETTINGS_META_KEY))?.value as Record<string, number>;
    expect('sync.tradeHub' in meta).toBe(false);
  });

  it('purges a remote settings tombstone older than 30 days', async () => {
    seedRemote(SETTINGS_PATH, [
      {
        key: 'sync.tradeHub',
        updatedAt: Date.now() - TOMBSTONE_TTL_MS - 60_000,
        ownerHash: HASH,
        deleted: true,
      },
    ]);
    await triggerSync(1);
    expect(remoteStore.get(SETTINGS_PATH)?.has('sync.tradeHub')).toBe(false);
  });

  it('a rewrite after the delete supersedes the local settings tombstone', async () => {
    // seedLocalSetting stands in for setSyncedSetting re-adding an allow-listed key.
    await db.settings.put({
      key: SETTINGS_TOMBSTONES_KEY,
      value: [{ key: 'sync.tradeHub', deletedAt: Date.now() - 1_000 }],
    });
    await seedLocalSetting('sync.tradeHub', 'amarr', Date.now());
    seedRemote(SETTINGS_PATH, [
      { key: 'sync.tradeHub', value: 'jita', updatedAt: Date.now() - 5_000, ownerHash: HASH },
    ]);
    await triggerSync(1);
    expect(remoteStore.get(SETTINGS_PATH)?.get('sync.tradeHub')).toMatchObject({
      value: 'amarr',
      deleted: false,
    });
    expect(await readLocalSettingsTombstones()).toEqual([]);
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
    expect(last.characterId).toBe(1);
  });

  it('reports an error state when sync fails', async () => {
    const states: SyncStatus[] = [];
    const unsubscribe = subscribeSyncStatus((s) => states.push(s));
    await expect(triggerSync(999)).rejects.toThrow(/Unknown character/);
    unsubscribe();
    expect(states[states.length - 1].state).toBe('error');
    expect(states[states.length - 1].error).toMatch(/Unknown character/);
  });

  it("keeps status per character: B's success does not mask A's error", async () => {
    await expect(triggerSync(999)).rejects.toThrow(/Unknown character/);
    await triggerSync(1);
    expect(getSyncStatus(1).state).toBe('idle');
    expect(getSyncStatus(999).state).toBe('error');
    expect(getSyncStatus(999).error).toMatch(/Unknown character/);
  });

  it('serializes syncs across characters (no interleaving mid-flight)', async () => {
    await db.characters.put({ characterId: 2, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(getDocs).mockImplementation((async (target: FakeQuery) => {
      order.push(target.col.path);
      if (target.col.path === 'characters/char:1/plans') await gate;
      return fake.getDocsImpl(target);
    }) as never);

    const p1 = triggerSync(1);
    const p2 = triggerSync(2);
    // Give character 2 every chance to (incorrectly) start while 1 is blocked.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order.some((path) => path.includes('char:2'))).toBe(false);

    release();
    await Promise.all([p1, p2]);
    expect(order.filter((path) => path.includes('char:2'))).toHaveLength(3);
  });

  it('a queued sync still runs after the previous one fails', async () => {
    const p999 = triggerSync(999);
    const p1 = triggerSync(1);
    await expect(p999).rejects.toThrow(/Unknown character/);
    await p1; // chain not poisoned by the failure
    expect(getSyncStatus(1).state).toBe('idle');
  });

  it('debounces scheduleSync into a single run', async () => {
    scheduleSync(1, 20);
    scheduleSync(1, 20);
    scheduleSync(1, 20);
    // One sync = one getDocs per collection (plans + buildPlans + settings).
    await vi.waitFor(() => expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 100)); // no extra runs
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });
});
