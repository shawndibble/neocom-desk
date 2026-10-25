// Two-way sync of every collection in the synced collection registry
// (syncedCollections.ts) — the editable collections, the Notification Feed
// and synced settings — for one character. Public API and UI wiring live in
// index.ts.
//
// Remote layout: /characters/char:{id}/{remoteName} for each declared
// collection.
// Merge policy is pure and lives in merge.ts: last-write-wins per record id,
// tombstones for deletes kept 30 days.
//
// Syncs are serialized GLOBALLY, not just per character: one pass at a time
// keeps the read load and the sweep ordering simple. Status is tracked per character so a later
// character's success cannot mask an earlier one's failure. Within one
// character's sync the collections pull concurrently (syncCharacter). Queued
// syncs start foreground-first (SyncPriority), so an edit never waits behind a
// whole background sweep.
//
// Owner-hash safety, so a previous owner's data neither leaks in nor gets
// pushed up: reads filter on the current hash, and Firestore rules deny
// single-doc reads whose ownerHash doesn't match the auth token's claim.

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
  appendTombstones,
  clearSeenSyncMarker,
  heartbeatKey,
  readSeenSyncMarker,
  tombstoneKey,
  writeSeenSyncMarker,
} from './localBookkeeping';
import { bumpRemoteMarker, canSkipPass, readRemoteMarker } from './syncMarker';
import { createSyncScheduler, type SyncPriority, type SyncScope } from './syncScheduler';
import { ensureSignedIn } from './syncAuth';
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

/**
 * Smallest gap between two `lastSyncedAt` heartbeat writes for one uid. Its
 * one reader, `functions/src/purgeStaleAccounts.ts`, purges after 90 days
 * without one, so a day's granularity costs it nothing.
 */
export const HEARTBEAT_INTERVAL_MS = 24 * 3_600_000;

// ---------------------------------------------------------------------------
// Sync status. Re-exported so the driver stays a single import site; the store
// itself is in status.ts (Firebase-free, so the UI can subscribe without this).
// ---------------------------------------------------------------------------

export { getSyncStatus, subscribeSyncStatus, type SyncState, type SyncStatus } from './status';

// ---------------------------------------------------------------------------
// Mutation helpers the UI layer should use
// ---------------------------------------------------------------------------

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

/**
 * `recordDeletion` for a whole batch under one collection's tombstone key —
 * one bulk row-delete plus one tombstone read/write, rather than a
 * read-modify-write cycle on the same `db.settings` row per id (what a loop
 * of `recordDeletion` calls would do, serialized against itself for no
 * reason: the row deletes are already independent of each other). A no-op
 * for an empty batch, so callers don't need their own length check.
 */
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

/** Delete a Skill Plan locally + tombstone, so the deletion propagates. */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, SKILL_PLANS, () => db.skillPlans.delete(planId));
}

/** Build Plan analogue of markPlanDeleted — same tombstone semantics. */
/**
 * Deliberately does *not* cascade to a Build Plan's own Production Runs
 * (reversed after initially cascading — see the decisions folder). A logged
 * run is a locked financial snapshot, not a live view of the plan: its
 * materialCost/jobFee/totalCost/quantity are fixed at logging time and never
 * re-derived, precisely so reusing or deleting the plan later (a blueprint's
 * market prices drift, ME/TE changes) cannot alter a profit figure already
 * booked. Deleting the plan the run happened to be logged under must not
 * delete the accounting record itself. `ProductionLogPanel` never renders
 * which plan a run came from (issue #525 follow-up), so an orphaned run has
 * nothing broken to display — it just can no longer be jumped to from a
 * Records row click.
 */
export async function markBuildPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, BUILD_PLANS, () => db.buildPlans.delete(planId));
}

/**
 * Bulk analogue of markBuildPlanDeleted — a Build Group delete cascading to
 * every member plan. Goes through `recordBulkDeletion` rather than one
 * `markBuildPlanDeleted` call per plan: parallel calls would each do their
 * own read-modify-write of the same tombstone list and race, silently
 * dropping tombstones for all but the last write to land.
 */
export async function markBuildPlansDeleted(characterId: number, planIds: string[]): Promise<void> {
  await recordBulkDeletion(characterId, planIds, BUILD_PLANS, (ids) =>
    db.buildPlans.bulkDelete(ids)
  );
}

/** Fitting analogue of markPlanDeleted — same tombstone semantics (issue #1538). */
export async function markFittingDeleted(characterId: number, fittingId: string): Promise<void> {
  await recordDeletion(characterId, fittingId, FITTINGS, () => db.fittings.delete(fittingId));
}

function stationPinId(characterId: number, locationId: number): string {
  return `${characterId}:${locationId}`;
}

/** Pin a station for one Character only (issue #84's per-character pin state). */
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

/**
 * Elevate a station's pin to account-wide: fan out one row per Character
 * currently known on this device — there is no shared account identity to key
 * a single record off (Account has no storage/sync, GLOSSARY.md), so each row
 * syncs under its own Character's ownerHash instead (parity-plan §5.7).
 *
 * This overwrites every known Character's existing row for the station,
 * including one that was previously `character`-scoped for a Character other
 * than whoever clicked. That's intentional, not a race: "account-wide" (issue
 * #84) means one shared elevated state for every Character, which by
 * definition supersedes any Character-specific opt-in that predates it.
 */
export async function setAccountStationPin(locationId: number): Promise<void> {
  await fanOutAccountWide(STATION_PINS, db.stationPins, (characterId, updatedAt) => ({
    id: stationPinId(characterId, locationId),
    characterId,
    locationId,
    scope: 'account' as const,
    updatedAt,
  }));
}

/**
 * Write one row per Character known on this device, then schedule a sync for
 * each. The shared body of every account-wide setter.
 */
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

/**
 * Unpin a station entirely, tombstoning its pin row under every Character it
 * was written for so the removal propagates on the next sync. The UI's own
 * pin cycle (unpinned -> character -> account -> unpinned, Assets.tsx) only
 * ever calls this from the `account` state — the blanket delete-by-location
 * is correct there because an account-wide pin is by definition shared across
 * every Character; there is no reachable path where this clears a single
 * Character's still-independent, not-yet-elevated pin out from under them.
 */
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

/**
 * Record a planet's best-to-worst resource ranking for the whole account.
 *
 * Fans out exactly like `setAccountStationPin`: one row per Character known on
 * this device, each synced under its own ownerHash, because there is no shared
 * account identity to key a single record off. Unlike a station pin there is
 * no per-Character variant to preserve — a planet's richness is the same fact
 * for every Character — so this always writes every row.
 */
export async function setPlanetRichness(planetId: number, order: number[]): Promise<void> {
  await fanOutAccountWide(PLANET_RICHNESS, db.planetRichness, (characterId, updatedAt) => ({
    id: planetRichnessId(characterId, planetId),
    characterId,
    planetId,
    order: [...order],
    updatedAt,
  }));
}

/**
 * Forget a planet's ranking, tombstoning it under every Character it was
 * written for so the removal propagates rather than resurrecting on the next
 * sync — the same reason `clearStationPin` exists rather than a bare delete.
 */
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

/** Write a synced setting ('sync.'-prefixed key) and stamp it for LWW merging. */
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

/**
 * Delete a synced setting locally and record a tombstone so the deletion
 * propagates to other devices on the next sync. Always use this instead of a
 * plain Dexie delete, or the setting resurrects from the remote copy.
 *
 * Deliberately does NOT check the allow-list — a key removed from
 * SYNCED_SETTING_KEYS must still be deletable. Like setSyncedSetting it leaves
 * scheduling to the caller (pair it with
 * `scheduleSync(characterId, { collections: ['settings'] })`).
 */
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

// ---------------------------------------------------------------------------
// Sync driver — the queue lives in syncScheduler.ts; a pass is syncCharacter.
// ---------------------------------------------------------------------------

export { type ScheduleSyncOptions, type SyncPriority, type SyncScope } from './syncScheduler';
const { scheduleSync, triggerSync, haltSync, resetSyncHalt } = createSyncScheduler(syncCharacter);
export { triggerSync, scheduleSync, haltSync, resetSyncHalt };

// ---------------------------------------------------------------------------
// Production Log mutations (issue #525). The run and its two linking-record
// collections are three plain registry declarations (syncedCollections.ts),
// each linking record its own document (see ProductionSaleLinkRecord /
// ProductionOrderWatchRecord in @/db for why) — ordinary mergeRecords
// LWW-per-document already gives each allocation its own independent merge.
// ---------------------------------------------------------------------------

/**
 * Delete a Production Run locally + tombstone, cascading to every sale link
 * and order watch that names it (issue #525) — an allocation left pointing at
 * a run that no longer exists is worse than a slightly noisier tombstone
 * list, and would otherwise linger forever in "already linked" checks.
 */
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

/**
 * Unlink a past sale from a Production Run. Tombstoned like every other
 * deletion here, so it doesn't resurrect from a device that hasn't synced
 * the removal yet and silently re-attribute the sale.
 */
export async function removeProductionSaleLink(characterId: number, linkId: string): Promise<void> {
  await recordDeletion(characterId, linkId, PRODUCTION_SALE_LINKS, () =>
    db.productionSaleLinks.delete(linkId)
  );
}

/** Stop watching an open sell order for a Production Run — same tombstone reasoning as removeProductionSaleLink. */
export async function removeProductionOrderWatch(
  characterId: number,
  watchId: string
): Promise<void> {
  await recordDeletion(characterId, watchId, PRODUCTION_ORDER_WATCHES, () =>
    db.productionOrderWatches.delete(watchId)
  );
}

/** Remove a Run Loss — same tombstone reasoning as removeProductionSaleLink. */
export async function removeProductionLoss(characterId: number, lossId: string): Promise<void> {
  await recordDeletion(characterId, lossId, PRODUCTION_LOSSES, () =>
    db.productionLosses.delete(lossId)
  );
}

/**
 * How many of one Character's collections pull at once. Every collection
 * touches only its own Dexie table, tombstone key and pull cursor (the
 * account-wide merges read sibling Characters' tombstones for *their own*
 * collection, which only that collection's pass writes), so their order never
 * mattered — they ran one after another purely because they were written as a
 * loop. A small cap rather than all thirteen at once keeps the browser's
 * per-host connection pool free for the page's own reads.
 */
const COLLECTION_PULL_CONCURRENCY = 4;

/** A unit of a sync pass; `name` is what a failure report says failed. */
interface NamedTask {
  name: string;
  run: () => Promise<void>;
}

/** A Firebase/Firestore error's `code` without its `firestore/`-style prefix. */
function errorCodeOf(error: unknown): string {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' ? code.replace(/^[a-z]+\//, '') : 'none';
}

/**
 * Run every task, at most `limit` at a time, and throw only once *all* of them
 * have settled: the one failure as-is, or an `AggregateError` of several.
 * Rejecting early would let the queue start the next Character — and swap the
 * Firebase session — under this one's still-running writes, the race the
 * global serialization exists to prevent.
 *
 * The thrown error is annotated with which tasks failed and with what codes,
 * for the Sentry report: an `AggregateError` carries neither in its message.
 */
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
          // Every failure kept for whoever inspects it; the message — what the sync
          // status line shows — stays the first one's, with a count.
          `${errors[0] instanceof Error ? errors[0].message : String(errors[0])} (and ${errors.length - 1} more)`
        );
  annotateFailure(thrown, {
    failed_collections: failures.map((f) => f.name).join(','),
    failed_count: String(failures.length),
    error_codes: [...new Set(errors.map(errorCodeOf))].join(','),
  });
  throw thrown;
}

/**
 * Bump the marker. A failed bump clears this device's claim too and reports
 * false; other devices then wait for their safety reconcile.
 */
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

/**
 * One pass for one Character over `requested`: every collection, or only the
 * named ones (syncScheduler.ts decides when narrowing is safe). Each listed
 * collection is still pulled before it is pushed — narrowing skips whole
 * collections, never the pull of one it writes. Resolves with the scope it ran.
 *
 * Change marker (issue #5073, syncMarker.ts): a full pass reads the Character's
 * marker first. A `background` one that finds it unchanged since this device's
 * last full pass ends there, one read instead of one query per collection.
 * Every pass that pushes bumps the marker once its pushes landed. The marker
 * never gates a foreground pass (boot, sync now, an edit), so local edits
 * always push. A marker the rules refuse (not deployed yet) or that fails to
 * bump only costs the shortcut, never the sync.
 */
async function syncCharacter(
  characterId: number,
  requested: SyncScope,
  priority: SyncPriority
): Promise<SyncScope> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}`);
  // A new owner's wipe empties every collection and clears every cursor:
  // whatever the request named, only a full pass refills them.
  const scope: SyncScope = (await handleOwnerHashChange(character)) ? 'all' : requested;

  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore(characterId);
  const ownerHash = character.ownerHash;
  const now = Date.now();
  let pushed = false;
  const ctx: SyncContext = {
    firestore,
    uid,
    ownerHash,
    characterId,
    now,
    onPush: () => {
      pushed = true;
    },
  };

  // The marker as it stood before this pass pulled anything: storing it after
  // is safe whatever lands meanwhile (a later bump just earns one more full pass).
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
    // Whatever this pass finds, the old claim "nothing changed" is spent.
    await clearSeenSyncMarker(characterId);
  }

  // A failing collection no longer stops the ones after it: each collection's
  // cursor only advances on its own success, so what did apply stays applied
  // and the failed one re-reads its window on the next pass. A collection
  // left out of a narrowed pass is not touched at all — its pull cursor,
  // tombstones and rows stay exactly as the last pass left them.
  const tasks: (NamedTask & { name: SyncedCollectionName })[] = [
    ...EDITABLE_COLLECTIONS.map((spec) => ({
      name: spec.remoteName,
      run: () => syncEditableCollection(spec, ctx),
    })),
    { name: NOTIFICATION_FEED.remoteName, run: () => syncFeed(ctx) },
    { name: SYNCED_SETTINGS.remoteName, run: () => syncSettings(ctx) },
  ];
  let bumped = true;
  try {
    await settleAllThenThrow(
      scope === 'all' ? tasks : tasks.filter((task) => scope.has(task.name)),
      COLLECTION_PULL_CONCURRENCY
    );
  } catch (error) {
    // Any failure, narrowed or not, can leave a local edit unpushed: the next
    // background pass must read for real rather than trust an unchanged marker.
    await clearSeenSyncMarker(characterId);
    throw error;
  } finally {
    // What did land still has to reach the other devices, failure or not.
    if (pushed) bumped = await bumpMarkerQuietly(firestore, uid, characterId);
  }
  if (scope === 'all' && markerBefore !== undefined && bumped) {
    await writeSeenSyncMarker(characterId, { version: markerBefore, fullAt: now });
  }
  // Heartbeat below means "every collection synced", which a narrowed pass
  // has not shown.
  if (scope !== 'all') return scope;

  // Heartbeat (issue #2065): stamped only once every collection above synced,
  // so the scheduled purge of accounts idle for 90 days sees an account that
  // syncs daily without edits as active. The rules allow this one field only.
  // That purge is its only reader, so it is throttled to one write a day
  // rather than one per sync (every mutation and every background sweep).
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
