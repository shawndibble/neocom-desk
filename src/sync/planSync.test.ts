import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, getDocs, setDoc, where } from 'firebase/firestore/lite';
import {
  db,
  type BuildPlanRecord,
  type NotificationFeedRecord,
  type ProductionOrderWatchRecord,
  type ProductionRunRecord,
  type ProductionSaleLinkRecord,
  type QuickbarRecord,
  type SkillPlanRecord,
  type StationPinRecord,
} from '@/db';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import { CACHE_PURGE_PENDING_PREFIX } from '@/esi/cachePurge';
import { FEED_SYNC_WINDOW_MS } from '@/features/notifications/feed';
import { backfillAccountWideData } from './accountWideBackfill';
import { remotePurgePendingKey } from './characterPurge';
import { TOMBSTONE_TTL_MS } from './merge';
import {
  clearStationPin,
  deleteSyncedSetting,
  getSyncStatus,
  markBuildPlanDeleted,
  markPlanDeleted,
  markProductionRunDeleted,
  removeProductionOrderWatch,
  removeProductionSaleLink,
  scheduleSync,
  setAccountStationPin,
  setCharacterStationPin,
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
    const docs = [...(remoteStore.get(path)?.entries() ?? [])]
      .filter(([, d]) => filters.every((f) => (f.op === '==' ? d[f.field] === f.value : true)))
      .map(([id, data]) => ({ id, data: () => data }));
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
const QUICKBARS_PATH = 'characters/char:1/quickbars';
const STATION_PINS_PATH = 'characters/char:1/stationPins';
const PLANET_RICHNESS_PATH = 'characters/char:1/planetRichness';
const PRODUCTION_RUNS_PATH = 'characters/char:1/productionRuns';
const PRODUCTION_SALE_LINKS_PATH = 'characters/char:1/productionSaleLinks';
const PRODUCTION_ORDER_WATCHES_PATH = 'characters/char:1/productionOrderWatches';
const SETTINGS_PATH = 'characters/char:1/settings';
const NOTIFICATION_FEED_PATH = 'characters/char:1/notificationFeed';
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

function quickbar(overrides: Partial<QuickbarRecord> = {}): QuickbarRecord {
  return {
    id: '1',
    characterId: 1,
    items: [{ typeId: 587, name: 'Rifter' }],
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function remoteQuickbarDoc(overrides: DocData = {}): DocData {
  return { ...quickbar(), ownerHash: HASH, deleted: false, ...overrides };
}

function stationPin(overrides: Partial<StationPinRecord> = {}): StationPinRecord {
  return {
    id: '1:60003760',
    characterId: 1,
    locationId: 60003760,
    scope: 'character',
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function remoteStationPinDoc(overrides: DocData = {}): DocData {
  return { ...stationPin(), ownerHash: HASH, deleted: false, ...overrides };
}

function productionRun(overrides: Partial<ProductionRunRecord> = {}): ProductionRunRecord {
  return {
    id: 'run-1',
    characterId: 1,
    buildPlanId: 'b1',
    productTypeID: 999,
    quantity: 10,
    materialCost: 500_000,
    jobFee: 50_000,
    totalCost: 550_000,
    loggedAt: Date.now() - 2000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function remoteProductionRunDoc(overrides: DocData = {}): DocData {
  return { ...productionRun(), ownerHash: HASH, deleted: false, ...overrides };
}

function productionSaleLink(
  overrides: Partial<ProductionSaleLinkRecord> = {}
): ProductionSaleLinkRecord {
  return {
    id: '1:txn:1001',
    characterId: 1,
    runId: 'run-1',
    transactionId: 1001,
    quantity: 5,
    unitPrice: 90_000,
    linkedAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

function productionOrderWatch(
  overrides: Partial<ProductionOrderWatchRecord> = {}
): ProductionOrderWatchRecord {
  return {
    id: '1:order:2001',
    characterId: 1,
    runId: 'run-1',
    orderId: 2001,
    unitPrice: 95_000,
    initialVolumeRemain: 5,
    lastKnownVolumeRemain: 5,
    closed: false,
    watchedAt: Date.now() - 1000,
    updatedAt: Date.now() - 1000,
    ...overrides,
  };
}

const FEED_ROW_FIRED_AT = Date.now() - 1000;

function feedRow(overrides: Partial<NotificationFeedRecord> = {}): NotificationFeedRecord {
  return {
    id: 'occ-1',
    characterId: 1,
    eventId: 'newMail',
    title: 'New mail',
    body: 'Pilot has new mail.',
    firedAt: FEED_ROW_FIRED_AT,
    ...overrides,
  };
}

function remoteFeedDoc(overrides: DocData = {}): DocData {
  return { ...feedRow(), ownerHash: HASH, ...overrides };
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
    db.quickbars.clear(),
    db.stationPins.clear(),
    db.planetRichness.clear(),
    db.settings.clear(),
    db.esiCache.clear(),
    db.notificationFeed.clear(),
    db.productionRuns.clear(),
    db.productionSaleLinks.clear(),
    db.productionOrderWatches.clear(),
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

describe('plan lens field mapping (What-If Implants + Booster)', () => {
  // The two lenses a plan is costed under are Editable Data like the entries
  // themselves — a plan that synced without them would quote different
  // training times on the other device.
  const whatIfImplants = { kind: 'custom' as const, bonuses: { memory: 5, perception: 4 } };
  const booster = { enabled: true, bonus: 12, expiresAt: 4_102_444_800_000 };

  it('round-trips both through push and pull', async () => {
    await db.skillPlans.add(plan({ whatIfImplants, booster }));
    await triggerSync(1);
    const remote = remoteStore.get(PLANS_PATH)?.get('p1');
    expect(remote?.whatIfImplants).toEqual(whatIfImplants);
    expect(remote?.booster).toEqual(booster);

    await db.skillPlans.delete('p1');
    seedRemote(PLANS_PATH, [remoteDoc({ whatIfImplants, booster, updatedAt: Date.now() + 1000 })]);
    await triggerSync(1);
    const local = await db.skillPlans.get('p1');
    expect(local?.whatIfImplants).toEqual(whatIfImplants);
    expect(local?.booster).toEqual(booster);
  });

  it('carries a Booster with no expiry set — null is a value, undefined is not', async () => {
    await db.skillPlans.add(plan({ booster: { enabled: false, bonus: 3, expiresAt: null } }));
    await triggerSync(1);
    expect(remoteStore.get(PLANS_PATH)?.get('p1')?.booster).toEqual({
      enabled: false,
      bonus: 3,
      expiresAt: null,
    });
  });

  it('omits both keys entirely when undefined (Firestore rejects undefined)', async () => {
    await db.skillPlans.add(plan());
    await triggerSync(1);
    const remote = remoteStore.get(PLANS_PATH)?.get('p1');
    expect(remote && 'whatIfImplants' in remote).toBe(false);
    expect(remote && 'booster' in remote).toBe(false);
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

  it('a learned remote tombstone is recorded locally, not just acted on (#436)', async () => {
    // Every collection gets this, not just account-wide ones (see the
    // decision doc for #436): a deletion pulled from remote previously left
    // no local trace once the row itself was gone, so a sibling Character's
    // own accountWideBackfill.ts scan could never see a deletion this device
    // only *learned* rather than originated.
    const deletedAt = Date.now() - 100;
    await db.skillPlans.put(plan({ updatedAt: Date.now() - 5000 }));
    seedRemote(PLANS_PATH, [remoteDoc({ deleted: true, updatedAt: deletedAt })]);
    await triggerSync(1);
    const tombstones = await db.settings.get('sync.__tombstones.1');
    expect(tombstones?.value).toEqual([{ id: 'p1', deletedAt }]);
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
    await db.quickbars.put(quickbar());
    await db.stationPins.put(stationPin());
    await db.productionRuns.put(productionRun());
    await db.productionSaleLinks.put(productionSaleLink());
    await db.productionOrderWatches.put(productionOrderWatch());
    await triggerSync(1);
    expect(await db.skillPlans.count()).toBe(0);
    expect(await db.buildPlans.count()).toBe(0);
    expect(await db.quickbars.count()).toBe(0);
    expect(await db.stationPins.count()).toBe(0);
    expect(await db.productionRuns.count()).toBe(0);
    expect(await db.productionSaleLinks.count()).toBe(0);
    expect(await db.productionOrderWatches.count()).toBe(0);
    expect(remoteStore.get(PLANS_PATH)?.get('p1')).toBeUndefined();
    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')).toBeUndefined();
    expect(remoteStore.get(QUICKBARS_PATH)?.get('1')).toBeUndefined();
    expect(remoteStore.get(STATION_PINS_PATH)?.get('1:60003760')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_RUNS_PATH)?.get('run-1')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1001')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_ORDER_WATCHES_PATH)?.get('1:order:2001')).toBeUndefined();
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
    // plans + buildPlans + quickbars + stationPins + planetRichness +
    // productionRuns + productionSaleLinks + productionOrderWatches +
    // notificationFeed + settings, each read through a where clause.
    expect(vi.mocked(where)).toHaveBeenCalledTimes(10);
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

describe('triggerSync: deferred remote purge retry', () => {
  it('retries and clears a pending remote-purge marker left by a removed character', async () => {
    await db.settings.put({ key: remotePurgePendingKey(1), value: true });
    seedRemote(PLANS_PATH, [remoteDoc({ id: 'stale' })]);

    await triggerSync(1);

    // The retry (ensureSignedIn now succeeds, per the module-level mock)
    // deletes every doc in the character's remote collections before the
    // normal push/pull below ever runs — an empty local table pulls nothing
    // back to replace it.
    expect(remoteStore.get(PLANS_PATH)?.has('stale')).toBe(false);
    expect(await db.settings.get(remotePurgePendingKey(1))).toBeUndefined();
  });

  it('does nothing extra when no purge is pending', async () => {
    seedRemote(PLANS_PATH, [remoteDoc({ id: 'kept' })]);

    await triggerSync(1);

    expect(remoteStore.get(PLANS_PATH)?.has('kept')).toBe(true);
  });
});

/**
 * The class of bug this pins: a field the UI writes onto a record, that the
 * collection spec then forgets to map, so the value is saved locally and
 * quietly never leaves the device (What-If Implants and the Booster were
 * exactly that, one layer up).
 *
 * A `CollectionSpec` lists its fields explicitly — never a spread, because
 * Firestore rejects `undefined` and a record carries local-only shapes — so
 * nothing but a test can notice the omission. The pinned key lists make
 * adding a field to a record fail here until its round trip is decided.
 */
describe('every stored field of a plan reaches the remote doc and comes back', () => {
  const fullSkillPlan: Required<SkillPlanRecord> = {
    id: 'p1',
    characterId: 1,
    name: 'Frigates V',
    entries: [{ skillTypeID: 3327, targetLevel: 5, priority: 'high' }],
    remapCount: 2,
    markers: [1],
    markerAttributes: [
      { intelligence: 17, memory: 17, perception: 27, willpower: 21, charisma: 17 },
    ],
    whatIfImplants: { kind: 'preset', preset: '+4' },
    booster: { enabled: true, bonus: 6, expiresAt: 4_102_444_800_000 },
    updatedAt: Date.now() - 1000,
  };

  const fullBuildPlan: Required<BuildPlanRecord> = {
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
    buildSystemId: 30003888,
    buildSystemName: 'Badivefi',
    facilityTaxPct: 1.5,
    materialSourcing: { 34: { ownedQuantity: 500, overridePrice: 6.5 } },
    ownedStockScope: {
      mode: 'selected',
      locations: [{ characterId: 1, locationId: 60003760, locationType: 'station' }],
    },
    buildHere: [57478],
    updatedAt: Date.now() - 1000,
  };

  it('pins the Skill Plan fields, so a new one has to be routed deliberately', () => {
    expect(Object.keys(fullSkillPlan).sort()).toEqual([
      'booster',
      'characterId',
      'entries',
      'id',
      'markerAttributes',
      'markers',
      'name',
      'remapCount',
      'updatedAt',
      'whatIfImplants',
    ]);
  });

  it('pins the Build Plan fields, so a new one has to be routed deliberately', () => {
    expect(Object.keys(fullBuildPlan).sort()).toEqual([
      'blueprintTypeID',
      'buildHere',
      'buildSystemId',
      'buildSystemName',
      'characterId',
      'facility',
      'facilityTaxPct',
      'hubId',
      'id',
      'materialSourcing',
      'me',
      'name',
      'ownedStockScope',
      'rigLevel',
      'runs',
      'security',
      'te',
      'updatedAt',
    ]);
  });

  it.each([
    ['skill plan', PLANS_PATH, () => db.skillPlans.put(fullSkillPlan), fullSkillPlan],
    ['build plan', BUILD_PLANS_PATH, () => db.buildPlans.put(fullBuildPlan), fullBuildPlan],
  ])('pushes every %s field', async (_label, path, put, record) => {
    await put();
    await triggerSync(1);
    const remote = remoteStore.get(path)?.get(record.id);
    expect(remote).toBeDefined();
    // Asserted key by key, and each wrapped back into a one-key object, so a
    // missing field fails naming itself rather than as one line of a
    // whole-document diff.
    for (const [key, value] of Object.entries(record)) {
      expect({ [key]: remote?.[key] }).toEqual({ [key]: value });
    }
  });

  it.each([
    ['skill plan', PLANS_PATH, () => db.skillPlans.get('p1'), fullSkillPlan],
    ['build plan', BUILD_PLANS_PATH, () => db.buildPlans.get('b1'), fullBuildPlan],
  ])('pulls every %s field back', async (_label, path, get, record) => {
    seedRemote(path, [{ ...record, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await get()).toEqual(record);
  });
});

describe('triggerSync: build plans', () => {
  it('drops a half-written build system rather than syncing an unlabelled one', async () => {
    // The id is what the fee is charged at and the name is what labels it, so
    // syncing one without the other would put a Badivefi fee under a Jita
    // heading. Neither travels unless both do.
    await db.buildPlans.put(buildPlan({ buildSystemId: 30003888 }));
    await triggerSync(1);
    const remote = remoteStore.get(BUILD_PLANS_PATH)?.get('b1');
    expect(remote).toBeDefined();
    expect(remote).not.toHaveProperty('buildSystemId');
    expect(remote).not.toHaveProperty('buildSystemName');
  });

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

  it('round-trips materialSourcing through the pushed doc', async () => {
    await db.buildPlans.put(buildPlan({ materialSourcing: { 34: { ownedQuantity: 500 } } }));
    await triggerSync(1);
    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')?.materialSourcing).toEqual({
      34: { ownedQuantity: 500 },
    });
  });

  it('drops undefined members inside materialSourcing (Firestore rejects undefined at any depth)', async () => {
    await db.buildPlans.put(
      buildPlan({ materialSourcing: { 34: { ownedQuantity: 500, overridePrice: undefined } } })
    );
    await triggerSync(1);
    const entry = (
      remoteStore.get(BUILD_PLANS_PATH)?.get('b1')?.materialSourcing as Record<string, object>
    )?.[34];
    expect(entry).toEqual({ ownedQuantity: 500 });
    expect('overridePrice' in (entry ?? {})).toBe(false);
  });

  it('omits an empty materialSourcing map from the pushed doc', async () => {
    await db.buildPlans.put(buildPlan({ materialSourcing: {} }));
    await triggerSync(1);
    const doc = remoteStore.get(BUILD_PLANS_PATH)?.get('b1');
    expect(doc).toBeDefined();
    expect('materialSourcing' in (doc ?? {})).toBe(false);
  });

  it('pulls materialSourcing from a remote build plan into Dexie', async () => {
    const expected = buildPlan({ materialSourcing: { 34: { overridePrice: 6.5 } } });
    seedRemote(BUILD_PLANS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.buildPlans.get('b1')).toEqual(expected);
  });

  it('round-trips ownedStockScope through the pushed doc', async () => {
    const scope = {
      mode: 'selected' as const,
      locations: [{ characterId: 1, locationId: 60003760, locationType: 'station' as const }],
    };
    await db.buildPlans.put(buildPlan({ ownedStockScope: scope }));
    await triggerSync(1);
    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')?.ownedStockScope).toEqual(scope);
  });

  it('round-trips buildHere through the pushed doc', async () => {
    await db.buildPlans.put(buildPlan({ buildHere: [57478, 57486] }));
    await triggerSync(1);

    expect(remoteStore.get(BUILD_PLANS_PATH)?.get('b1')?.buildHere).toEqual([57478, 57486]);
  });

  it('omits an empty buildHere from the pushed doc — collapsing every row leaves no trace', async () => {
    await db.buildPlans.put(buildPlan({ buildHere: [] }));
    await triggerSync(1);

    expect('buildHere' in (remoteStore.get(BUILD_PLANS_PATH)?.get('b1') ?? {})).toBe(false);
  });

  it('pulls buildHere from a remote build plan into Dexie', async () => {
    const expected = buildPlan({ buildHere: [57478] });
    seedRemote(BUILD_PLANS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);

    expect(await db.buildPlans.get('b1')).toEqual(expected);
  });

  it('omits ownedStockScope from the pushed doc when absent (Firestore rejects undefined)', async () => {
    await db.buildPlans.put(buildPlan());
    await triggerSync(1);
    const doc = remoteStore.get(BUILD_PLANS_PATH)?.get('b1');
    expect(doc).toBeDefined();
    expect('ownedStockScope' in (doc ?? {})).toBe(false);
  });

  it('pulls ownedStockScope from a remote build plan into Dexie', async () => {
    const expected = buildPlan({ ownedStockScope: { mode: 'everywhere' } });
    seedRemote(BUILD_PLANS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.buildPlans.get('b1')).toEqual(expected);
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

  it('markBuildPlanDeleted cascades to every Production Run logged against the plan, and their own sale links', async () => {
    await db.buildPlans.put(buildPlan());
    await db.productionRuns.put(productionRun());
    await db.productionSaleLinks.put(productionSaleLink());

    await markBuildPlanDeleted(1, 'b1');

    expect(await db.productionRuns.get('run-1')).toBeUndefined();
    expect(await db.productionSaleLinks.get('1:txn:1001')).toBeUndefined();
  });

  it('a remote tombstone deletes the local build plan', async () => {
    await db.buildPlans.put(buildPlan({ updatedAt: Date.now() - 5000 }));
    seedRemote(BUILD_PLANS_PATH, [remoteBuildDoc({ deleted: true, updatedAt: Date.now() - 100 })]);
    await triggerSync(1);
    expect(await db.buildPlans.get('b1')).toBeUndefined();
  });
});

describe('triggerSync: quickbar', () => {
  it('pushes a local-only quickbar with ownerHash and deleted: false', async () => {
    const q = quickbar();
    await db.quickbars.put(q);
    await triggerSync(1);
    expect(remoteStore.get(QUICKBARS_PATH)?.get('1')).toEqual({
      id: '1',
      characterId: 1,
      items: [{ typeId: 587, name: 'Rifter' }],
      updatedAt: q.updatedAt,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('pulls a remote-only quickbar into Dexie without remote-only fields', async () => {
    const expected = quickbar();
    seedRemote(QUICKBARS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.quickbars.get('1')).toEqual(expected);
  });

  it('LWW: newer remote quickbar overwrites local', async () => {
    const now = Date.now();
    await db.quickbars.put(quickbar({ items: [{ typeId: 1, name: 'Old' }], updatedAt: now - 900 }));
    seedRemote(QUICKBARS_PATH, [
      remoteQuickbarDoc({ items: [{ typeId: 2, name: 'New' }], updatedAt: now - 10 }),
    ]);
    await triggerSync(1);
    expect((await db.quickbars.get('1'))?.items).toEqual([{ typeId: 2, name: 'New' }]);
  });
});

describe('triggerSync: planet richness (#425)', () => {
  it('pushes a local-only ranking with ownerHash and deleted: false', async () => {
    await db.planetRichness.put({
      id: '1:40000001',
      characterId: 1,
      planetId: 40_000_001,
      order: [2073, 2268],
      updatedAt: 5_000,
    });
    await triggerSync(1);
    expect(remoteStore.get(PLANET_RICHNESS_PATH)?.get('1:40000001')).toEqual({
      id: '1:40000001',
      characterId: 1,
      planetId: 40_000_001,
      order: [2073, 2268],
      updatedAt: 5_000,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('pulls a remote-only ranking into Dexie without remote-only fields', async () => {
    seedRemote(PLANET_RICHNESS_PATH, [
      {
        id: '1:40000001',
        characterId: 1,
        planetId: 40_000_001,
        order: [2268, 2073],
        updatedAt: 5_000,
        ownerHash: HASH,
        deleted: false,
      },
    ]);
    await triggerSync(1);
    expect(await db.planetRichness.get('1:40000001')).toEqual({
      id: '1:40000001',
      characterId: 1,
      planetId: 40_000_001,
      order: [2268, 2073],
      updatedAt: 5_000,
    });
  });

  it('keeps the ordering itself intact, since order is the entire payload', async () => {
    // A ranking is only meaningful as a sequence — a round trip that sorted,
    // deduped or reversed it would silently invert what the pilot recorded.
    const order = [2270, 2073, 2268, 2267];
    await db.planetRichness.put({
      id: '1:40000001',
      characterId: 1,
      planetId: 40_000_001,
      order,
      updatedAt: 5_000,
    });
    await triggerSync(1);
    expect(remoteStore.get(PLANET_RICHNESS_PATH)?.get('1:40000001')).toMatchObject({ order });
  });

  it('a Character added on a fully-stale device does not resurrect a deleted ranking (#436)', async () => {
    // Same scenario as the station pins case below, proving the accountWide
    // check is genuinely generic (issue #436's AC#4) rather than only wired
    // up for station pins: every planet richness row is account-wide by
    // definition (no `scope` to opt out of, unlike station pins).
    const now = Date.now();
    const staleUpdatedAt = now - 10_000;
    const deletedAt = now - 5_000;

    await db.planetRichness.put({
      id: '1:40000001',
      characterId: 1,
      planetId: 40_000_001,
      order: [2073, 2268],
      updatedAt: staleUpdatedAt,
    });
    seedRemote(PLANET_RICHNESS_PATH, [
      {
        id: '1:40000001',
        characterId: 1,
        planetId: 40_000_001,
        order: [2073, 2268],
        updatedAt: deletedAt,
        ownerHash: HASH,
        deleted: true,
      },
    ]);

    await db.characters.put({ characterId: 4, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    expect(await backfillAccountWideData(4)).toBe(true);
    expect(await db.planetRichness.get('4:40000001')).toMatchObject({ updatedAt: staleUpdatedAt });

    await triggerSync(1);
    await triggerSync(4);

    expect(await db.planetRichness.get('4:40000001')).toBeUndefined();
    expect(remoteStore.get('characters/char:4/planetRichness')?.get('4:40000001')?.deleted).toBe(
      true
    );
  });
});

describe('triggerSync: Production Log (#525)', () => {
  it('pushes a locally-logged Production Run', async () => {
    await db.productionRuns.put(productionRun());
    await triggerSync(1);
    expect(remoteStore.get(PRODUCTION_RUNS_PATH)?.get('run-1')).toMatchObject({
      id: 'run-1',
      characterId: 1,
      buildPlanId: 'b1',
      quantity: 10,
      materialCost: 500_000,
      jobFee: 50_000,
      totalCost: 550_000,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('pulls a remote-only Production Run into Dexie', async () => {
    seedRemote(PRODUCTION_RUNS_PATH, [remoteProductionRunDoc()]);
    await triggerSync(1);
    expect(await db.productionRuns.get('run-1')).toMatchObject({
      id: 'run-1',
      buildPlanId: 'b1',
      quantity: 10,
    });
  });

  it('deletes a Production Run remotely via markProductionRunDeleted', async () => {
    await db.productionRuns.put(productionRun());
    await triggerSync(1);
    expect(remoteStore.get(PRODUCTION_RUNS_PATH)?.get('run-1')).toBeDefined();

    await markProductionRunDeleted(1, 'run-1');
    await triggerSync(1);

    expect(await db.productionRuns.get('run-1')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_RUNS_PATH)?.get('run-1')?.deleted).toBe(true);
  });

  it('cascades markProductionRunDeleted to the run’s sale links and order watches', async () => {
    await db.productionRuns.put(productionRun());
    await db.productionSaleLinks.put(productionSaleLink());
    await db.productionOrderWatches.put(productionOrderWatch());
    await triggerSync(1);

    await markProductionRunDeleted(1, 'run-1');
    await triggerSync(1);

    expect(await db.productionSaleLinks.get('1:txn:1001')).toBeUndefined();
    expect(await db.productionOrderWatches.get('1:order:2001')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1001')?.deleted).toBe(true);
    expect(remoteStore.get(PRODUCTION_ORDER_WATCHES_PATH)?.get('1:order:2001')?.deleted).toBe(true);
  });

  it('gives two sale links against the same run independent documents, so linking different sales on two devices never collides (issue #525 finding 1/2)', async () => {
    // "Device A" links transaction 1001, "device B" links transaction 1002 —
    // both to the same run, before either has seen the other's write. Because
    // each link is keyed on its own deterministic transaction id rather than
    // sharing one document (or an array field) with the run, both survive a
    // sync with no field to be clobbered.
    await db.productionRuns.put(productionRun());
    await db.productionSaleLinks.put(productionSaleLink({ id: '1:txn:1001', transactionId: 1001 }));
    await db.productionSaleLinks.put(productionSaleLink({ id: '1:txn:1002', transactionId: 1002 }));

    await triggerSync(1);

    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1001')).toBeDefined();
    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1002')).toBeDefined();
  });

  it('removeProductionSaleLink tombstones just the one link, leaving its sibling intact', async () => {
    await db.productionRuns.put(productionRun());
    await db.productionSaleLinks.put(productionSaleLink({ id: '1:txn:1001', transactionId: 1001 }));
    await db.productionSaleLinks.put(productionSaleLink({ id: '1:txn:1002', transactionId: 1002 }));
    await triggerSync(1);

    await removeProductionSaleLink(1, '1:txn:1001');
    await triggerSync(1);

    expect(await db.productionSaleLinks.get('1:txn:1001')).toBeUndefined();
    expect(await db.productionSaleLinks.get('1:txn:1002')).toBeDefined();
    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1001')?.deleted).toBe(true);
    expect(remoteStore.get(PRODUCTION_SALE_LINKS_PATH)?.get('1:txn:1002')?.deleted).toBeFalsy();
  });

  it('pushes and removes an order watch', async () => {
    await db.productionRuns.put(productionRun());
    await db.productionOrderWatches.put(productionOrderWatch());
    await triggerSync(1);
    expect(remoteStore.get(PRODUCTION_ORDER_WATCHES_PATH)?.get('1:order:2001')).toMatchObject({
      orderId: 2001,
      initialVolumeRemain: 5,
      lastKnownVolumeRemain: 5,
      closed: false,
    });

    await removeProductionOrderWatch(1, '1:order:2001');
    await triggerSync(1);

    expect(await db.productionOrderWatches.get('1:order:2001')).toBeUndefined();
    expect(remoteStore.get(PRODUCTION_ORDER_WATCHES_PATH)?.get('1:order:2001')?.deleted).toBe(true);
  });
});

describe('triggerSync: station pins', () => {
  it('pushes a local-only station pin with ownerHash and deleted: false', async () => {
    const p = stationPin();
    await db.stationPins.put(p);
    await triggerSync(1);
    expect(remoteStore.get(STATION_PINS_PATH)?.get('1:60003760')).toEqual({
      id: '1:60003760',
      characterId: 1,
      locationId: 60003760,
      scope: 'character',
      updatedAt: p.updatedAt,
      ownerHash: HASH,
      deleted: false,
    });
  });

  it('pulls a remote-only station pin into Dexie without remote-only fields', async () => {
    const expected = stationPin();
    seedRemote(STATION_PINS_PATH, [{ ...expected, ownerHash: HASH, deleted: false }]);
    await triggerSync(1);
    expect(await db.stationPins.get('1:60003760')).toEqual(expected);
  });

  it('LWW: newer remote pin overwrites local', async () => {
    const now = Date.now();
    await db.stationPins.put(stationPin({ scope: 'character', updatedAt: now - 900 }));
    seedRemote(STATION_PINS_PATH, [remoteStationPinDoc({ scope: 'account', updatedAt: now - 10 })]);
    await triggerSync(1);
    expect((await db.stationPins.get('1:60003760'))?.scope).toBe('account');
  });

  it('setCharacterStationPin writes a character-scoped pin for that Character only', async () => {
    await setCharacterStationPin(1, 60003760);
    expect(await db.stationPins.get('1:60003760')).toMatchObject({
      characterId: 1,
      locationId: 60003760,
      scope: 'character',
    });
  });

  it('setAccountStationPin fans the pin out to every known Character', async () => {
    await db.characters.put({ characterId: 2, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    await setAccountStationPin(60003760);
    expect(await db.stationPins.get('1:60003760')).toMatchObject({
      characterId: 1,
      locationId: 60003760,
      scope: 'account',
    });
    expect(await db.stationPins.get('2:60003760')).toMatchObject({
      characterId: 2,
      locationId: 60003760,
      scope: 'account',
    });
  });

  it('clearStationPin tombstones every fanned-out row so the removal propagates for every Character', async () => {
    await db.characters.put({ characterId: 2, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    await setAccountStationPin(60003760);
    seedRemote(STATION_PINS_PATH, [
      remoteStationPinDoc({ id: '1:60003760', characterId: 1, scope: 'account' }),
    ]);

    await clearStationPin(60003760);
    expect(await db.stationPins.get('1:60003760')).toBeUndefined();
    expect(await db.stationPins.get('2:60003760')).toBeUndefined();

    await triggerSync(1);
    const doc = remoteStore.get(STATION_PINS_PATH)?.get('1:60003760');
    expect(doc?.deleted).toBe(true);
    const tombstones = await db.settings.get('sync.__stationPinTombstones.1');
    expect(tombstones?.value).toEqual([]);
  });

  it('a Character added on a fully-stale device does not resurrect a deletion learned during the same sync (#436)', async () => {
    const now = Date.now();
    const staleUpdatedAt = now - 10_000;
    const deletedAt = now - 5_000;

    // This device never pulled Character 1's deletion: its local copy of the
    // account-wide pin still predates it.
    await db.stationPins.put(
      stationPin({ id: '1:60003760', scope: 'account', updatedAt: staleUpdatedAt })
    );
    // Another device already deleted it and pushed the tombstone remotely.
    seedRemote(STATION_PINS_PATH, [
      {
        id: '1:60003760',
        characterId: 1,
        locationId: 60003760,
        scope: 'account',
        updatedAt: deletedAt,
        ownerHash: HASH,
        deleted: true,
      },
    ]);

    // A Character new to this device is added; the backfill clones the
    // still-local, still-stale row onto it — no tombstone anywhere names
    // '4:60003760' yet.
    await db.characters.put({ characterId: 4, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    expect(await backfillAccountWideData(4)).toBe(true);
    expect(await db.stationPins.get('4:60003760')).toMatchObject({ updatedAt: staleUpdatedAt });

    // Sync both, per the acceptance criteria: Character 1 first, learning the
    // deletion it had not yet pulled locally...
    await triggerSync(1);
    // ...then the newly added Character, whose sync must not push the stale
    // clone now that the account-wide deletion is known locally.
    await triggerSync(4);

    expect(await db.stationPins.get('4:60003760')).toBeUndefined();
    expect(remoteStore.get('characters/char:4/stationPins')?.get('4:60003760')?.deleted).toBe(true);
  });

  it("records the account-wide tombstone at the real deletion time, not a stale remote copy's (#436)", async () => {
    const now = Date.now();
    const staleUpdatedAt = now - 10_000;
    const deletedAt = now - 5_000;

    // A resurrected clone that was already pushed remotely on an earlier,
    // pre-fix sync — its remote copy is live, not a tombstone, and shares the
    // resurrected row's own (stale) updatedAt.
    await db.characters.put({ characterId: 4, name: 'Alt', ownerHash: HASH, addedAt: 1 });
    await db.stationPins.put(
      stationPin({ id: '4:60003760', characterId: 4, scope: 'account', updatedAt: staleUpdatedAt })
    );
    seedRemote('characters/char:4/stationPins', [
      {
        id: '4:60003760',
        characterId: 4,
        locationId: 60003760,
        scope: 'account',
        updatedAt: staleUpdatedAt,
        ownerHash: HASH,
        deleted: false,
      },
    ]);
    // Character 1 already learned the account-wide deletion on an earlier sync.
    await db.settings.put({
      key: 'sync.__stationPinTombstones.1',
      value: [{ id: '1:60003760', deletedAt }],
    });

    await triggerSync(4);

    expect(await db.stationPins.get('4:60003760')).toBeUndefined();
    const doc = remoteStore.get('characters/char:4/stationPins')?.get('4:60003760');
    // The real deletion time, not the stale live doc's updatedAt.
    expect(doc).toMatchObject({ deleted: true, updatedAt: deletedAt });
    const tombstones = await db.settings.get('sync.__stationPinTombstones.4');
    expect(tombstones?.value).toEqual([{ id: '4:60003760', deletedAt }]);
  });
});

describe('triggerSync: notification feed', () => {
  it('pushes a local-only row within the sync window', async () => {
    await db.notificationFeed.put(feedRow());
    await triggerSync(1);
    expect(remoteStore.get(NOTIFICATION_FEED_PATH)?.get('occ-1')).toEqual(remoteFeedDoc());
  });

  it('does not push a row older than the 30-day/100-row sync window', async () => {
    await db.notificationFeed.put(feedRow({ firedAt: Date.now() - FEED_SYNC_WINDOW_MS - 60_000 }));
    await triggerSync(1);
    expect(remoteStore.get(NOTIFICATION_FEED_PATH)?.has('occ-1')).toBeFalsy();
  });

  it('pulls a remote-only row into Dexie without the ownerHash field', async () => {
    seedRemote(NOTIFICATION_FEED_PATH, [remoteFeedDoc()]);
    await triggerSync(1);
    expect(await db.notificationFeed.get('occ-1')).toEqual(feedRow());
  });

  it('never syncs another Character’s feed rows onto this uid', async () => {
    await db.notificationFeed.put(feedRow({ id: 'other-char', characterId: 2 }));
    await triggerSync(1);
    expect(remoteStore.get(NOTIFICATION_FEED_PATH)?.has('other-char')).toBeFalsy();
  });

  it('a dismissal on one device propagates to the other (push direction)', async () => {
    const dismissedAt = Date.now() - 10;
    await db.notificationFeed.put(feedRow({ dismissedAt }));
    seedRemote(NOTIFICATION_FEED_PATH, [remoteFeedDoc()]);
    await triggerSync(1);
    expect(remoteStore.get(NOTIFICATION_FEED_PATH)?.get('occ-1')?.dismissedAt).toBe(dismissedAt);
  });

  it('a dismissal on the other device propagates here (pull direction)', async () => {
    const dismissedAt = Date.now() - 10;
    await db.notificationFeed.put(feedRow());
    seedRemote(NOTIFICATION_FEED_PATH, [remoteFeedDoc({ dismissedAt })]);
    await triggerSync(1);
    expect((await db.notificationFeed.get('occ-1'))?.dismissedAt).toBe(dismissedAt);
  });

  it('a dismissal pulls in even for a row that has aged out of the local push window', async () => {
    const firedAt = Date.now() - FEED_SYNC_WINDOW_MS - 60_000;
    const dismissedAt = Date.now() - 10;
    await db.notificationFeed.put(feedRow({ firedAt }));
    seedRemote(NOTIFICATION_FEED_PATH, [remoteFeedDoc({ firedAt, dismissedAt })]);
    await triggerSync(1);
    expect((await db.notificationFeed.get('occ-1'))?.dismissedAt).toBe(dismissedAt);
  });

  it('writes no tombstone and never deletes a remote row', async () => {
    await db.notificationFeed.put(feedRow({ dismissedAt: Date.now() }));
    await triggerSync(1);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('a pulled row never exceeds the local NOTIFICATION_FEED_LIMIT cap', async () => {
    const now = Date.now();
    await db.notificationFeed.bulkPut(
      Array.from({ length: 300 }, (_, i) => feedRow({ id: `local-${i}`, firedAt: now - i }))
    );
    seedRemote(NOTIFICATION_FEED_PATH, [remoteFeedDoc({ id: 'incoming', firedAt: now + 1 })]);
    await triggerSync(1);
    expect(await db.notificationFeed.count()).toBe(300);
    expect(await db.notificationFeed.get('incoming')).toBeDefined();
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
    // One getDocs per synced collection (see the collection-count comment in
    // the "debounces scheduleSync" test above).
    expect(order.filter((path) => path.includes('char:2'))).toHaveLength(10);
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
    // One sync = one getDocs per collection (plans + buildPlans + quickbars +
    // stationPins + planetRichness + productionRuns + productionSaleLinks +
    // productionOrderWatches + notificationFeed + settings).
    await vi.waitFor(() => expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(10));
    await new Promise((resolve) => setTimeout(resolve, 100)); // no extra runs
    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(10);
    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });
});
