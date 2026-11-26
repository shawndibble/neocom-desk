import { collection, doc, setDoc } from 'firebase/firestore/lite';
import { db } from '@/db';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { annotateFailure } from '@/observability/reportFailure';
import { syncEditableCollection, type SyncContext } from './collectionSync';
import { syncFeed } from './feedSync';
import {
  SYNCED_PREFIX,
  isSyncedSettingKey,
  readSettingsMeta,
  readSettingsTombstones,
  syncSettings,
  writeSettingsMeta,
  writeSettingsTombstones,
} from './settingsSync';
import { getSyncFirestore } from './firebaseApp';
import { handleOwnerHashChange } from './ownerHash';
import {
  advanceSeenSyncMarker,
  appendTombstones,
  clearSeenSyncMarker,
  heartbeatKey,
  readSeenSyncMarker,
  type SeenSyncMarker,
  tombstoneKey,
  writeSeenSyncMarker,
} from './localBookkeeping';
import { bumpRemoteMarker, canSkipPass, readRemoteMarker } from './syncMarker';
import { createSyncScheduler, type SyncPriority, type SyncScope } from './syncScheduler';
import { confirmOwnership, ensureSignedIn } from './syncAuth';
import { isAllowedSyncedSettingKey } from './syncedSettings';
import {
  BUILD_PLANS,
  EDITABLE_COLLECTIONS,
  FITTINGS,
  NOTIFICATION_FEED,
  PLANET_RICHNESS,
  PRODUCTION_ORDER_WATCHES,
  PRODUCTION_LOSSES,
  PRODUCTION_RUNS,
  PRODUCTION_SALE_LINKS,
  SKILL_PLANS,
  STATION_PINS,
  SYNCED_SETTINGS,
  type EditableCollection,
  type SyncedCollectionName,
} from './syncedCollections';
import { HOUR_MS } from '@/lib/age';

export const HEARTBEAT_INTERVAL_MS = 24 * HOUR_MS;

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';

async function recordDeletion(
  characterId: number,
  id: string,
  spec: EditableCollection,
  deleteRow: () => Promise<void>
): Promise<void> {
  await deleteRow();
  await appendTombstones(tombstoneKey(spec, characterId), [id]);
  scheduleSync(characterId, { collections: [spec.remoteName] });
}

async function recordBulkDeletion(
  characterId: number,
  ids: string[],
  spec: EditableCollection,
  deleteRows: (ids: string[]) => Promise<unknown>
): Promise<void> {
  if (ids.length === 0) return;
  await deleteRows(ids);
  await appendTombstones(tombstoneKey(spec, characterId), ids);
  scheduleSync(characterId, { collections: [spec.remoteName] });
}

export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, SKILL_PLANS, () => db.skillPlans.delete(planId));
}

export async function markBuildPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, BUILD_PLANS, () => db.buildPlans.delete(planId));
}

export async function markBuildPlansDeleted(characterId: number, planIds: string[]): Promise<void> {
  await recordBulkDeletion(characterId, planIds, BUILD_PLANS, (ids) =>
    db.buildPlans.bulkDelete(ids)
  );
}

export async function markFittingDeleted(characterId: number, fittingId: string): Promise<void> {
  await recordDeletion(characterId, fittingId, FITTINGS, () => db.fittings.delete(fittingId));
}

function stationPinId(characterId: number, locationId: number): string {
  return `${characterId}:${locationId}`;
}

export async function setCharacterStationPin(
  characterId: number,
  locationId: number
): Promise<void> {
  await db.stationPins.put({
    id: stationPinId(characterId, locationId),
    characterId,
    locationId,
    scope: 'character',
    updatedAt: Date.now(),
  });
  scheduleSync(characterId, { collections: [STATION_PINS.remoteName] });
}

export async function setAccountStationPin(locationId: number): Promise<void> {
  await fanOutAccountWide(STATION_PINS, db.stationPins, (characterId, updatedAt) => ({
    id: stationPinId(characterId, locationId),
    characterId,
    locationId,
    scope: 'account' as const,
    updatedAt,
  }));
}

async function fanOutAccountWide<T>(
  spec: EditableCollection,
  table: { bulkPut(rows: T[]): Promise<unknown> },
  toRow: (characterId: number, updatedAt: number) => T
): Promise<void> {
  const characters = await db.characters.toArray();
  const now = Date.now();
  await table.bulkPut(characters.map((c) => toRow(c.characterId, now)));
  for (const c of characters) scheduleSync(c.characterId, { collections: [spec.remoteName] });
}

export async function clearStationPin(locationId: number): Promise<void> {
  const rows = await db.stationPins.where('locationId').equals(locationId).toArray();
  await Promise.all(
    rows.map((row) =>
      recordDeletion(row.characterId, row.id, STATION_PINS, () => db.stationPins.delete(row.id))
    )
  );
}

function planetRichnessId(characterId: number, planetId: number): string {
  return `${characterId}:${planetId}`;
}

export async function setPlanetRichness(planetId: number, order: number[]): Promise<void> {
  await fanOutAccountWide(PLANET_RICHNESS, db.planetRichness, (characterId, updatedAt) => ({
    id: planetRichnessId(characterId, planetId),
    characterId,
    planetId,
    order: [...order],
    updatedAt,
  }));
}

export async function clearPlanetRichness(planetId: number): Promise<void> {
  const rows = await db.planetRichness.where('planetId').equals(planetId).toArray();
  await Promise.all(
    rows.map((row) =>
      recordDeletion(row.characterId, row.id, PLANET_RICHNESS, () =>
        db.planetRichness.delete(row.id)
      )
    )
  );
}

export async function setSyncedSetting(key: string, value: unknown): Promise<void> {
  if (!isSyncedSettingKey(key)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  if (!isAllowedSyncedSettingKey(key)) {
    throw new Error(
      `'${key}' is not on the synced-settings allow-list. Add it to SYNCED_SETTING_KEYS ` +
        `in src/sync/syncedSettings.ts (and its pinned test), and delete it via ` +
        `deleteSyncedSetting so the tombstone path applies.`
    );
  }
  await db.settings.put({ key, value });
  const meta = await readSettingsMeta();
  meta[key] = Date.now();
  await writeSettingsMeta(meta);
}

export async function deleteSyncedSetting(key: string): Promise<void> {
  if (!isSyncedSettingKey(key)) {
    throw new Error(`Synced settings keys must start with '${SYNCED_PREFIX}' (got '${key}')`);
  }
  await db.settings.delete(key);
  const meta = await readSettingsMeta();
  if (key in meta) {
    delete meta[key];
    await writeSettingsMeta(meta);
  }
  const tombstones = (await readSettingsTombstones()).filter((t) => t.key !== key);
  tombstones.push({ key, deletedAt: Date.now() });
  await writeSettingsTombstones(tombstones);
}

export { type ScheduleSyncOptions, type SyncPriority, type SyncScope } from './syncScheduler';
const { scheduleSync, triggerSync, haltSync, resetSyncHalt } = createSyncScheduler(syncCharacter);
export { triggerSync, scheduleSync, haltSync, resetSyncHalt };

export async function markProductionRunDeleted(characterId: number, runId: string): Promise<void> {
  const [saleLinks, orderWatches, losses] = await Promise.all([
    db.productionSaleLinks.where('runId').equals(runId).toArray(),
    db.productionOrderWatches.where('runId').equals(runId).toArray(),
    db.productionLosses.where('runId').equals(runId).toArray(),
  ]);
  await recordBulkDeletion(
    characterId,
    saleLinks.map((l) => l.id),
    PRODUCTION_SALE_LINKS,
    (ids) => db.productionSaleLinks.bulkDelete(ids)
  );
  await recordBulkDeletion(
    characterId,
    orderWatches.map((w) => w.id),
    PRODUCTION_ORDER_WATCHES,
    (ids) => db.productionOrderWatches.bulkDelete(ids)
  );
  await recordBulkDeletion(
    characterId,
    losses.map((l) => l.id),
    PRODUCTION_LOSSES,
    (ids) => db.productionLosses.bulkDelete(ids)
  );
  await recordDeletion(characterId, runId, PRODUCTION_RUNS, () => db.productionRuns.delete(runId));
}

export async function removeProductionSaleLink(characterId: number, linkId: string): Promise<void> {
  await recordDeletion(characterId, linkId, PRODUCTION_SALE_LINKS, () =>
    db.productionSaleLinks.delete(linkId)
  );
}

export async function removeProductionOrderWatch(
  characterId: number,
  watchId: string
): Promise<void> {
  await recordDeletion(characterId, watchId, PRODUCTION_ORDER_WATCHES, () =>
    db.productionOrderWatches.delete(watchId)
  );
}

export async function removeProductionLoss(characterId: number, lossId: string): Promise<void> {
  await recordDeletion(characterId, lossId, PRODUCTION_LOSSES, () =>
    db.productionLosses.delete(lossId)
  );
}

const COLLECTION_PULL_CONCURRENCY = 4;

interface NamedTask {
  name: string;
  run: () => Promise<void>;
}

function errorCodeOf(error: unknown): string {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' ? code.replace(/^[a-z]+\//, '') : 'none';
}

async function settleAllThenThrow(tasks: readonly NamedTask[], limit: number): Promise<void> {
  const failures: { name: string; error: unknown }[] = [];
  await mapWithConcurrencyLimit(tasks, limit, async (task) => {
    try {
      await task.run();
    } catch (error) {
      failures.push({ name: task.name, error });
    }
  });
  if (failures.length === 0) return;
  const errors = failures.map((f) => f.error);
  const thrown =
    errors.length === 1
      ? errors[0]
      : new AggregateError(
          errors,
          `${errors[0] instanceof Error ? errors[0].message : String(errors[0])} (and ${errors.length - 1} more)`
        );
  annotateFailure(thrown, {
    failed_collections: failures.map((f) => f.name).join(','),
    failed_count: String(failures.length),
    error_codes: [...new Set(errors.map(errorCodeOf))].join(','),
  });
  throw thrown;
}

async function bumpMarkerQuietly(
  firestore: SyncContext['firestore'],
  uid: string,
  characterId: number
): Promise<boolean> {
  try {
    await bumpRemoteMarker(firestore, uid, 1);
    return true;
  } catch {
    await clearSeenSyncMarker(characterId);
    return false;
  }
}

class UnknownCharacterError extends Error {
  override readonly name = 'UnknownCharacterError';
  constructor(characterId: number) {
    super(`Unknown character ${characterId}`);
  }
}

async function syncCharacter(
  characterId: number,
  requested: SyncScope,
  priority: SyncPriority
): Promise<SyncScope> {
  const character = await db.characters.get(characterId);
  if (!character) throw new UnknownCharacterError(characterId);
  const scope: SyncScope = (await handleOwnerHashChange(character)) ? 'all' : requested;

  const ownerHash = character.ownerHash;
  const uid = await ensureSignedIn(characterId, ownerHash);
  const firestore = getSyncFirestore(characterId);
  const now = Date.now();
  let pushed = false;
  let confirmed: Promise<boolean> | undefined;
  const ctx: SyncContext = {
    firestore,
    uid,
    ownerHash,
    characterId,
    now,
    onPush: () => {
      pushed = true;
    },
    confirmOwner: () => (confirmed ??= confirmOwnership(characterId, ownerHash)),
  };

  let markerBefore: number | undefined;
  if (scope === 'all') {
    try {
      let remote = await readRemoteMarker(firestore, uid);
      const seen = priority === 'background' ? await readSeenSyncMarker(characterId) : undefined;
      if (canSkipPass(seen, remote, now)) return 'all';
      if (remote === null) {
        await bumpRemoteMarker(firestore, uid, 0);
        remote = 0;
      }
      markerBefore = remote;
    } catch {
      markerBefore = undefined;
    }
    await clearSeenSyncMarker(characterId);
  }

  let notReady = false;
  const tasks: (NamedTask & { name: SyncedCollectionName })[] = [
    ...EDITABLE_COLLECTIONS.map((spec) => ({
      name: spec.remoteName,
      run: async () => {
        try {
          await syncEditableCollection(spec, ctx);
        } catch (error) {
          if (!spec.rulesMayLag || errorCodeOf(error) !== 'permission-denied') throw error;
          notReady = true;
        }
      },
    })),
    { name: NOTIFICATION_FEED.remoteName, run: () => syncFeed(ctx) },
    { name: SYNCED_SETTINGS.remoteName, run: () => syncSettings(ctx) },
  ];
  let bumped = true;
  let seenBeforeBump: SeenSyncMarker | undefined;
  try {
    await settleAllThenThrow(
      scope === 'all' ? tasks : tasks.filter((task) => scope.has(task.name)),
      COLLECTION_PULL_CONCURRENCY
    );
  } catch (error) {
    await clearSeenSyncMarker(characterId);
    throw error;
  } finally {
    if (pushed) {
      seenBeforeBump = scope === 'all' ? undefined : await readSeenSyncMarker(characterId);
      bumped = await bumpMarkerQuietly(firestore, uid, characterId);
    }
  }
  if (scope === 'all') {
    if (markerBefore !== undefined && bumped && !notReady) {
      await writeSeenSyncMarker(characterId, {
        version: markerBefore + (pushed ? 1 : 0),
        fullAt: now,
      });
    }
  } else if (pushed && bumped && seenBeforeBump !== undefined) {
    await advanceSeenSyncMarker(characterId, seenBeforeBump);
  }
  if (scope !== 'all') return scope;

  const lastHeartbeat = (await db.settings.get(heartbeatKey(uid)))?.value;
  if (typeof lastHeartbeat !== 'number' || now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    await setDoc(
      doc(collection(firestore, 'characters'), uid),
      { lastSyncedAt: now },
      { merge: true }
    );
    await db.settings.put({ key: heartbeatKey(uid), value: now });
  }
  return scope;
}
