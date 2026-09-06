// Two-way sync of Skill Plans, Build Plans, the Quickbar, Station Pins,
// Production Runs + their two linking-record collections, + synced settings
// for one character. Public API and UI wiring live in index.ts.
//
// Remote layout: /characters/char:{id}/{plans,buildPlans,quickbars,stationPins,
// productionRuns,productionSaleLinks,productionOrderWatches,settings}.
// Merge policy is pure and lives in merge.ts: last-write-wins per record id,
// tombstones for deletes kept 30 days.
//
// Syncs are serialized GLOBALLY, not just per character: the Firebase session is
// a single slot swapped by ensureSignedIn, so two concurrent syncs would race
// the auth state mid-flight. Status is tracked per character so a later
// character's success cannot mask an earlier one's failure.
//
// Owner-hash safety, so a previous owner's data neither leaks in nor gets
// pushed up: reads filter on the current hash, and Firestore rules deny
// single-doc reads whose ownerHash doesn't match the auth token's claim.

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  type CollectionReference,
  type Firestore,
} from 'firebase/firestore/lite';
import {
  db,
  type BuildPlanRecord,
  type CharacterRecord,
  type NotificationFeedRecord,
  type PlanetRichnessRecord,
  type ProductionOrderWatchRecord,
  type ProductionRunRecord,
  type ProductionSaleLinkRecord,
  type QuickbarRecord,
  type SkillPlanRecord,
  type StationPinRecord,
  type PayeeRecord,
  type MiningTaxAssignmentRecord,
} from '@/db';
import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import { planetRichnessDeletedAtByKey, stationPinDeletedAtByKey } from './accountWideBackfill';
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import {
  mergeFeedRecord,
  readFeed,
  rowsWithinSyncWindow,
  trimFeed,
} from '@/features/notifications/feed';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { retryPendingRemotePurge } from './characterPurge';
import { getSyncFirestore } from './firebaseApp';
import {
  buildPlanTombstonesKey,
  INTERNAL_PREFIX,
  ownerHashKey,
  planTombstonesKey,
  quickbarTombstonesKey,
  stationPinTombstonesKey,
  planetRichnessTombstonesKey,
  payeeTombstonesKey,
  miningTaxAssignmentTombstonesKey,
  productionOrderWatchTombstonesKey,
  productionRunTombstonesKey,
  productionSaleLinkTombstonesKey,
  readTombstones,
} from './localBookkeeping';
import { setStatus } from './status';
import { ensureSignedIn } from './syncAuth';
import {
  mergeFeed,
  mergeRecords,
  mergeSettings,
  type LocalTombstone,
  type RemoteBuildPlanDoc,
  type RemoteDoc,
  type RemoteFeedDoc,
  type RemotePlanDoc,
  type RemoteQuickbarDoc,
  type RemoteStationPinDoc,
  type RemotePlanetRichnessDoc,
  type RemotePayeeDoc,
  type RemoteMiningTaxAssignmentDoc,
  type RemoteProductionOrderWatchDoc,
  type RemoteProductionRunDoc,
  type RemoteProductionSaleLinkDoc,
  type RemoteSyncedSetting,
  type SyncedSettingTombstone,
  type SyncedSettingValue,
  type SyncRecord,
} from './merge';
import { isAllowedSyncedSettingKey } from './syncedSettings';

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and
// never synced; 'sync.' keys are the user settings that DO sync.
// ---------------------------------------------------------------------------

const SYNCED_PREFIX = 'sync.';
// Key builders (ownerHashKey, planTombstonesKey, buildPlanTombstonesKey,
// quickbarTombstonesKey) live in localBookkeeping.ts, Firebase-free, so
// features/character/removeCharacter.ts can clear them without pulling in
// Firebase. The Quickbar is one record per character, never deleted (only
// emptied), so its tombstone key stays empty in practice — kept for symmetry
// with syncEditableCollection, which needs one for every CollectionSpec.
const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
// Synced settings are a single global set (not per-character, like plans), so
// their tombstones live under one global key too — a delete recorded during
// one character's sync must be visible on every other character's pass.
const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;

function isSyncedSettingKey(key: string): boolean {
  return key.startsWith(SYNCED_PREFIX) && !key.startsWith(INTERNAL_PREFIX);
}

async function writeTombstones(key: string, tombstones: LocalTombstone[]): Promise<void> {
  await db.settings.put({ key, value: tombstones });
}

async function readSettingsMeta(): Promise<Record<string, number>> {
  const record = await db.settings.get(SETTINGS_META_KEY);
  return record && typeof record.value === 'object' && record.value !== null
    ? { ...(record.value as Record<string, number>) }
    : {};
}

async function writeSettingsMeta(meta: Record<string, number>): Promise<void> {
  await db.settings.put({ key: SETTINGS_META_KEY, value: meta });
}

async function readSettingsTombstones(): Promise<SyncedSettingTombstone[]> {
  const record = await db.settings.get(SETTINGS_TOMBSTONES_KEY);
  return Array.isArray(record?.value) ? (record.value as SyncedSettingTombstone[]) : [];
}

async function writeSettingsTombstones(tombstones: SyncedSettingTombstone[]): Promise<void> {
  await db.settings.put({ key: SETTINGS_TOMBSTONES_KEY, value: tombstones });
}

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
  tombstoneKey: string,
  deleteRow: () => Promise<void>
): Promise<void> {
  await deleteRow();
  const tombstones = (await readTombstones(tombstoneKey)).filter((t) => t.id !== id);
  tombstones.push({ id, deletedAt: Date.now() });
  await writeTombstones(tombstoneKey, tombstones);
  scheduleSync(characterId);
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
  tombstoneKey: string,
  deleteRows: (ids: string[]) => Promise<unknown>
): Promise<void> {
  if (ids.length === 0) return;
  await deleteRows(ids);
  const now = Date.now();
  const remaining = (await readTombstones(tombstoneKey)).filter((t) => !ids.includes(t.id));
  await writeTombstones(tombstoneKey, [...remaining, ...ids.map((id) => ({ id, deletedAt: now }))]);
  scheduleSync(characterId);
}

/** Delete a Skill Plan locally + tombstone, so the deletion propagates. */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, planTombstonesKey(characterId), () =>
    db.skillPlans.delete(planId)
  );
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
  await recordDeletion(characterId, planId, buildPlanTombstonesKey(characterId), () =>
    db.buildPlans.delete(planId)
  );
}

/** Payee analogue of markPlanDeleted — same tombstone semantics (issue #523). */
export async function markPayeeDeleted(characterId: number, payeeId: string): Promise<void> {
  await recordDeletion(characterId, payeeId, payeeTombstonesKey(characterId), () =>
    db.payees.delete(payeeId)
  );
}

/** Mining Tax Assignment analogue of markPlanDeleted — same tombstone semantics (issue #523). */
export async function markMiningTaxAssignmentDeleted(
  characterId: number,
  assignmentId: string
): Promise<void> {
  await recordDeletion(
    characterId,
    assignmentId,
    miningTaxAssignmentTombstonesKey(characterId),
    () => db.miningTaxAssignments.delete(assignmentId)
  );
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
  scheduleSync(characterId);
}

/**
 * Elevate a station's pin to account-wide: fan out one row per Character
 * currently known on this device — there is no shared account identity to key
 * a single record off (Account has no storage/sync, CONTEXT.md), so each row
 * syncs under its own Character's ownerHash instead (parity-plan §5.7).
 *
 * This overwrites every known Character's existing row for the station,
 * including one that was previously `character`-scoped for a Character other
 * than whoever clicked. That's intentional, not a race: "account-wide" (issue
 * #84) means one shared elevated state for every Character, which by
 * definition supersedes any Character-specific opt-in that predates it.
 */
export async function setAccountStationPin(locationId: number): Promise<void> {
  const characters = await db.characters.toArray();
  const now = Date.now();
  await db.stationPins.bulkPut(
    characters.map((c) => ({
      id: stationPinId(c.characterId, locationId),
      characterId: c.characterId,
      locationId,
      scope: 'account' as const,
      updatedAt: now,
    }))
  );
  for (const c of characters) scheduleSync(c.characterId);
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
      recordDeletion(row.characterId, row.id, stationPinTombstonesKey(row.characterId), () =>
        db.stationPins.delete(row.id)
      )
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
  const characters = await db.characters.toArray();
  const now = Date.now();
  await db.planetRichness.bulkPut(
    characters.map((c) => ({
      id: planetRichnessId(c.characterId, planetId),
      characterId: c.characterId,
      planetId,
      order: [...order],
      updatedAt: now,
    }))
  );
  for (const c of characters) scheduleSync(c.characterId);
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
      recordDeletion(row.characterId, row.id, planetRichnessTombstonesKey(row.characterId), () =>
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
 * scheduling to the caller (pair it with scheduleSync(characterId)).
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
// Sync driver
// ---------------------------------------------------------------------------

const running = new Map<number, Promise<void>>();
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const DEFAULT_DEBOUNCE_MS = 2000;
// Global serialization chain. Never left rejected: failures surface through the
// per-run promise and the status stream.
let syncChain: Promise<void> = Promise.resolve();

/** Debounced sync — call after each edit. */
export function scheduleSync(characterId: number, debounceMs = DEFAULT_DEBOUNCE_MS): void {
  const existing = pendingTimers.get(characterId);
  if (existing !== undefined) clearTimeout(existing);
  pendingTimers.set(
    characterId,
    setTimeout(() => {
      pendingTimers.delete(characterId);
      triggerSync(characterId).catch(() => {
        // Failure already surfaced via subscribeSyncStatus.
      });
    }, debounceMs)
  );
}

/**
 * Run a sync now. Coalesced per character (an already-running sync for it is
 * awaited instead) and serialized globally.
 */
export function triggerSync(characterId: number): Promise<void> {
  const pending = pendingTimers.get(characterId);
  if (pending !== undefined) {
    clearTimeout(pending);
    pendingTimers.delete(characterId);
  }
  const active = running.get(characterId);
  if (active) return active;

  const run = syncChain.then(async () => {
    setStatus(characterId, { state: 'syncing', error: null });
    try {
      await syncCharacter(characterId);
      setStatus(characterId, { state: 'idle', lastSyncedAt: Date.now(), error: null });
    } catch (error) {
      setStatus(characterId, {
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      running.delete(characterId);
    }
  });
  syncChain = run.catch(() => {
    // Keep the chain alive; the failure is reported via `run` and the status.
  });
  running.set(characterId, run);
  return run;
}

/**
 * EVE changes a character's ownerHash when it is sold or transferred. If it
 * changed since our last sync, the local editable data belongs to the previous
 * owner — wipe it, its tombstones and its cached ESI responses.
 */
async function handleOwnerHashChange(character: CharacterRecord): Promise<void> {
  const key = ownerHashKey(character.characterId);
  const stored = await db.settings.get(key);
  if (stored !== undefined && stored.value !== character.ownerHash) {
    await db.skillPlans.where('characterId').equals(character.characterId).delete();
    await db.buildPlans.where('characterId').equals(character.characterId).delete();
    await db.quickbars.where('characterId').equals(character.characterId).delete();
    await db.stationPins.where('characterId').equals(character.characterId).delete();
    await db.planetRichness.where('characterId').equals(character.characterId).delete();
    await db.productionRuns.where('characterId').equals(character.characterId).delete();
    await db.productionSaleLinks.where('characterId').equals(character.characterId).delete();
    await db.productionOrderWatches.where('characterId').equals(character.characterId).delete();
    await db.payees.where('characterId').equals(character.characterId).delete();
    await db.miningTaxAssignments.where('characterId').equals(character.characterId).delete();
    await writeTombstones(planTombstonesKey(character.characterId), []);
    await writeTombstones(buildPlanTombstonesKey(character.characterId), []);
    await writeTombstones(quickbarTombstonesKey(character.characterId), []);
    await writeTombstones(stationPinTombstonesKey(character.characterId), []);
    await writeTombstones(planetRichnessTombstonesKey(character.characterId), []);
    await writeTombstones(productionRunTombstonesKey(character.characterId), []);
    await writeTombstones(productionSaleLinkTombstonesKey(character.characterId), []);
    await writeTombstones(productionOrderWatchTombstonesKey(character.characterId), []);
    await writeTombstones(payeeTombstonesKey(character.characterId), []);
    await writeTombstones(miningTaxAssignmentTombstonesKey(character.characterId), []);
    // Cached wallet/mail/assets belong to the previous owner just as much as
    // the plans do. `auth/session` purges on the same signal at login; this
    // covers a transfer noticed between logins. Degrades rather than throws
    // (esi/cachePurge.ts) — a failing purge must not fail the sync.
    const outcome = await purgeCharacterCacheOrSuppress(character.characterId);
    // 'suppressed' = both purge tiers failed, rows still on disk. Suppression
    // can be memory-only, so advancing the bookmark would burn the last retry:
    // after a reload the marker is gone, the hash matches and the previous
    // owner's data reads normally. Leaving it makes the next sync re-detect;
    // the plan deletes above are idempotent.
    if (outcome === 'suppressed') return;
  }
  await db.settings.put({ key, value: character.ownerHash });
}

// ---------------------------------------------------------------------------
// Generic editable-collection sync (Skill Plans, Build Plans)
// ---------------------------------------------------------------------------

interface CollectionSpec<L extends SyncRecord, R extends RemoteDoc> {
  /** Firestore subcollection name under /characters/{uid}. */
  name: string;
  tombstoneKey: (characterId: number) => string;
  loadLocal: (characterId: number) => Promise<L[]>;
  /** Full remote doc payload for a local record (explicit field list — never spread). */
  toRemoteDoc: (local: L, ownerHash: string) => Record<string, unknown>;
  /** Local record from a remote doc, stripping remote-only fields. */
  toLocalRecord: (remote: R) => L;
  bulkPutLocal: (records: L[]) => Promise<unknown>;
  bulkDeleteLocal: (ids: string[]) => Promise<unknown>;
  /**
   * Account-wide collections only (issue #436): the shared key a deletion is
   * recognized by regardless of which Character's id a row was copied onto,
   * and the current per-key deletion times to check it against. See
   * `AccountWideTombstones` in merge.ts.
   */
  accountWide?: {
    sharedKey: (record: L) => string | undefined;
    deletedAtByKey: () => Promise<Map<string, number>>;
  };
}

interface SyncContext {
  firestore: Firestore;
  uid: string;
  ownerHash: string;
  characterId: number;
  now: number;
}

async function fetchOwnedDocs<R extends { ownerHash: string }>(
  col: CollectionReference,
  ownerHash: string
): Promise<R[]> {
  // Rules allow listing only what the client's where clause provably scopes to;
  // an unfiltered getDocs would also trip over stale-hash docs after a transfer.
  const snapshot = await getDocs(query(col, where('ownerHash', '==', ownerHash)));
  return snapshot.docs.map((d) => d.data() as R);
}

async function syncEditableCollection<L extends SyncRecord, R extends RemoteDoc>(
  spec: CollectionSpec<L, R>,
  ctx: SyncContext
): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, spec.name);
  const remote = await fetchOwnedDocs<R>(col, ctx.ownerHash);
  const local = await spec.loadLocal(ctx.characterId);
  const tombstoneKey = spec.tombstoneKey(ctx.characterId);
  const tombstones = await readTombstones(tombstoneKey);
  const accountWide = spec.accountWide
    ? {
        sharedKey: spec.accountWide.sharedKey,
        deletedAtByKey: await spec.accountWide.deletedAtByKey(),
      }
    : undefined;
  const plan = mergeRecords<L, R>(local, tombstones, remote, ctx.now, accountWide);

  await Promise.all([
    ...plan.pushUpserts.map((p) => setDoc(doc(col, p.id), spec.toRemoteDoc(p, ctx.ownerHash))),
    ...plan.pushTombstones.map((t) =>
      setDoc(doc(col, t.id), {
        id: t.id,
        characterId: ctx.characterId,
        updatedAt: t.deletedAt,
        ownerHash: ctx.ownerHash,
        deleted: true,
      })
    ),
    ...plan.purgeRemote.map((id) => deleteDoc(doc(col, id))),
  ]);

  if (plan.pullUpserts.length > 0) {
    await spec.bulkPutLocal(plan.pullUpserts.map(spec.toLocalRecord));
  }
  if (plan.deleteLocal.length > 0) {
    await spec.bulkDeleteLocal(plan.deleteLocal);
  }
  // A remote tombstone pulled down here (`deleteLocal`) previously left no
  // local trace once the row itself was gone — so `deletedAtByKey()`
  // (accountWideBackfill.ts, and `accountWide` above) only ever saw a
  // deletion this device originated itself, never one it merely learned by
  // pulling. Recording it here closes that gap for every collection, not
  // just account-wide ones: it is exactly the same fact a locally-originated
  // delete already records via `recordDeletion`, just learned a step later.
  //
  // Two distinct sources land in `deleteLocal`, with two distinct correct
  // timestamps: an ordinary remote tombstone (`r.deleted`) carries its
  // deletion time as `r.updatedAt`, but `accountWide`'s self-heal (merge.ts)
  // always pairs its `deleteLocal` push with a `pushTombstones` entry whose
  // `deletedAt` is the real deletion time — `remoteById.get(id)?.updatedAt`
  // there would be the row's pre-deletion, still-live remote copy, which is
  // stale by definition (that mismatch is exactly what triggered the
  // self-heal). `pushTombstones` is checked first for that reason.
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const pushTombstoneById = new Map(plan.pushTombstones.map((t) => [t.id, t.deletedAt]));
  const learned: LocalTombstone[] = plan.deleteLocal.flatMap((id) => {
    const deletedAt = pushTombstoneById.get(id) ?? remoteById.get(id)?.updatedAt;
    return deletedAt !== undefined ? [{ id, deletedAt }] : [];
  });
  // Pushed tombstones are now recorded remotely; resolved ones are dropped.
  const settled = new Set([...plan.clearLocalTombstones, ...plan.pushTombstones.map((t) => t.id)]);
  if (settled.size > 0 || learned.length > 0) {
    await writeTombstones(tombstoneKey, [
      ...tombstones.filter((t) => !settled.has(t.id) && !learned.some((l) => l.id === t.id)),
      ...learned,
    ]);
  }
}

const skillPlanSpec: CollectionSpec<SkillPlanRecord, RemotePlanDoc> = {
  name: 'plans',
  tombstoneKey: planTombstonesKey,
  loadLocal: (characterId) => db.skillPlans.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    entries: p.entries,
    remapCount: p.remapCount,
    // Firestore rejects undefined values, so optional fields are omitted.
    ...(p.markers !== undefined ? { markers: p.markers } : {}),
    ...(p.markerAttributes !== undefined ? { markerAttributes: p.markerAttributes } : {}),
    // The lenses the plan is costed under (What-If Implants, Booster) are
    // part of the plan, not a per-device view preference, so they travel
    // with it. Same omit-when-absent rule; a Booster's own `expiresAt` is
    // `number | null`, and null is a value Firestore stores happily.
    ...(p.whatIfImplants !== undefined ? { whatIfImplants: p.whatIfImplants } : {}),
    ...(p.booster !== undefined ? { booster: p.booster } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    entries: r.entries,
    remapCount: r.remapCount,
    ...(r.markers !== undefined ? { markers: r.markers } : {}),
    ...(r.markerAttributes !== undefined ? { markerAttributes: r.markerAttributes } : {}),
    ...(r.whatIfImplants !== undefined ? { whatIfImplants: r.whatIfImplants } : {}),
    ...(r.booster !== undefined ? { booster: r.booster } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.skillPlans.bulkPut(records),
  bulkDeleteLocal: (ids) => db.skillPlans.bulkDelete(ids),
};

const buildPlanSpec: CollectionSpec<BuildPlanRecord, RemoteBuildPlanDoc> = {
  name: 'buildPlans',
  tombstoneKey: buildPlanTombstonesKey,
  loadLocal: (characterId) => db.buildPlans.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => {
    // Firestore rejects undefined at any depth, so the map is normalized (empty
    // and undefined-valued entries dropped) before it can reach a setDoc.
    const materialSourcing = normalizeMaterialSourcingMap(p.materialSourcing);
    return {
      id: p.id,
      characterId: p.characterId,
      name: p.name,
      blueprintTypeID: p.blueprintTypeID,
      runs: p.runs,
      me: p.me,
      te: p.te,
      facility: p.facility,
      rigLevel: p.rigLevel,
      security: p.security,
      hubId: p.hubId,
      // One fact, routed as one pair: the id is what the fee is charged at and
      // the name is what labels it, so a half-pair would label the cost index
      // with a system it was not charged at. A half-pair syncs as neither,
      // which falls the plan back to its hub — wrong, but not lying.
      ...(p.buildSystemId !== undefined && p.buildSystemName !== undefined
        ? { buildSystemId: p.buildSystemId, buildSystemName: p.buildSystemName }
        : {}),
      // Independent, unlike the system pair above: an id whose name ESI
      // withheld still travels, and the picker composes the stand-in label.
      ...(p.buildLocationId !== undefined ? { buildLocationId: p.buildLocationId } : {}),
      ...(p.buildLocationName !== undefined ? { buildLocationName: p.buildLocationName } : {}),
      ...(p.facilityTaxPct !== undefined ? { facilityTaxPct: p.facilityTaxPct } : {}),
      ...(p.materialPriceBasis !== undefined ? { materialPriceBasis: p.materialPriceBasis } : {}),
      ...(materialSourcing !== undefined ? { materialSourcing } : {}),
      ...(p.ownedStockScope !== undefined ? { ownedStockScope: p.ownedStockScope } : {}),
      // An empty selection is omitted rather than pushed as [], so a plan that
      // expanded a row and collapsed it again is byte-identical to one that
      // never did — the same rule materialSourcing follows above.
      ...(p.buildHere !== undefined && p.buildHere.length > 0 ? { buildHere: p.buildHere } : {}),
      updatedAt: p.updatedAt,
      ownerHash,
      deleted: false,
    };
  },
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    blueprintTypeID: r.blueprintTypeID,
    runs: r.runs,
    me: r.me,
    te: r.te,
    facility: r.facility,
    rigLevel: r.rigLevel,
    security: r.security,
    hubId: r.hubId,
    ...(r.buildSystemId !== undefined && r.buildSystemName !== undefined
      ? { buildSystemId: r.buildSystemId, buildSystemName: r.buildSystemName }
      : {}),
    ...(r.buildLocationId !== undefined ? { buildLocationId: r.buildLocationId } : {}),
    ...(r.buildLocationName !== undefined ? { buildLocationName: r.buildLocationName } : {}),
    ...(r.facilityTaxPct !== undefined ? { facilityTaxPct: r.facilityTaxPct } : {}),
    ...(r.materialPriceBasis !== undefined ? { materialPriceBasis: r.materialPriceBasis } : {}),
    ...(r.materialSourcing !== undefined ? { materialSourcing: r.materialSourcing } : {}),
    ...(r.ownedStockScope !== undefined ? { ownedStockScope: r.ownedStockScope } : {}),
    ...(r.buildHere !== undefined ? { buildHere: r.buildHere } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.buildPlans.bulkPut(records),
  bulkDeleteLocal: (ids) => db.buildPlans.bulkDelete(ids),
};

const quickbarSpec: CollectionSpec<QuickbarRecord, RemoteQuickbarDoc> = {
  name: 'quickbars',
  tombstoneKey: quickbarTombstonesKey,
  loadLocal: (characterId) => db.quickbars.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (q, ownerHash) => ({
    id: q.id,
    characterId: q.characterId,
    items: q.items,
    updatedAt: q.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    items: r.items,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.quickbars.bulkPut(records),
  bulkDeleteLocal: (ids) => db.quickbars.bulkDelete(ids),
};

const stationPinSpec: CollectionSpec<StationPinRecord, RemoteStationPinDoc> = {
  name: 'stationPins',
  tombstoneKey: stationPinTombstonesKey,
  loadLocal: (characterId) => db.stationPins.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    locationId: p.locationId,
    scope: p.scope,
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    locationId: r.locationId,
    scope: r.scope,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.stationPins.bulkPut(records),
  bulkDeleteLocal: (ids) => db.stationPins.bulkDelete(ids),
  accountWide: {
    // Only an account-wide row can be resurrected onto a Character added
    // after the delete (accountWideBackfill.ts only ever copies `scope:
    // 'account'` rows) — a `character`-scoped pin at the same locationId
    // must not be caught by a deletion that only ever applied to the
    // account-wide one.
    sharedKey: (row) => (row.scope === 'account' ? String(row.locationId) : undefined),
    deletedAtByKey: stationPinDeletedAtByKey,
  },
};

const planetRichnessSpec: CollectionSpec<PlanetRichnessRecord, RemotePlanetRichnessDoc> = {
  name: 'planetRichness',
  tombstoneKey: planetRichnessTombstonesKey,
  loadLocal: (characterId) => db.planetRichness.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (row, ownerHash) => ({
    id: row.id,
    characterId: row.characterId,
    planetId: row.planetId,
    order: row.order,
    updatedAt: row.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    planetId: r.planetId,
    order: r.order,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.planetRichness.bulkPut(records),
  bulkDeleteLocal: (ids) => db.planetRichness.bulkDelete(ids),
  accountWide: {
    // Every row is account-wide — no per-Character variant exists to opt out.
    sharedKey: (row) => String(row.planetId),
    deletedAtByKey: planetRichnessDeletedAtByKey,
  },
};

const payeeSpec: CollectionSpec<PayeeRecord, RemotePayeeDoc> = {
  name: 'payees',
  tombstoneKey: payeeTombstonesKey,
  loadLocal: (characterId) => db.payees.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    defaultTaxPct: p.defaultTaxPct,
    ...(p.systemId !== undefined ? { systemId: p.systemId } : {}),
    ...(p.entityId !== undefined ? { entityId: p.entityId } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    defaultTaxPct: r.defaultTaxPct,
    ...(r.systemId !== undefined ? { systemId: r.systemId } : {}),
    ...(r.entityId !== undefined ? { entityId: r.entityId } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.payees.bulkPut(records),
  bulkDeleteLocal: (ids) => db.payees.bulkDelete(ids),
};

const miningTaxAssignmentSpec: CollectionSpec<
  MiningTaxAssignmentRecord,
  RemoteMiningTaxAssignmentDoc
> = {
  name: 'miningTaxAssignments',
  tombstoneKey: miningTaxAssignmentTombstonesKey,
  loadLocal: (characterId) =>
    db.miningTaxAssignments.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (a, ownerHash) => ({
    id: a.id,
    characterId: a.characterId,
    date: a.date,
    solarSystemId: a.solarSystemId,
    ...(a.payeeId !== undefined ? { payeeId: a.payeeId } : {}),
    oreLines: a.oreLines,
    taxPct: a.taxPct,
    estimatedValue: a.estimatedValue,
    taxOwed: a.taxOwed,
    status: a.status,
    ...(a.reviewDiff !== undefined ? { reviewDiff: a.reviewDiff } : {}),
    ...(a.paidAt !== undefined ? { paidAt: a.paidAt } : {}),
    ...(a.groupId !== undefined ? { groupId: a.groupId } : {}),
    ...(a.collectsGrowth !== undefined ? { collectsGrowth: a.collectsGrowth } : {}),
    ...(a.payment !== undefined ? { payment: a.payment } : {}),
    updatedAt: a.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    date: r.date,
    solarSystemId: r.solarSystemId,
    ...(r.payeeId !== undefined ? { payeeId: r.payeeId } : {}),
    oreLines: r.oreLines,
    taxPct: r.taxPct,
    estimatedValue: r.estimatedValue,
    taxOwed: r.taxOwed,
    status: r.status,
    ...(r.reviewDiff !== undefined ? { reviewDiff: r.reviewDiff } : {}),
    ...(r.paidAt !== undefined ? { paidAt: r.paidAt } : {}),
    ...(r.groupId !== undefined ? { groupId: r.groupId } : {}),
    ...(r.collectsGrowth !== undefined ? { collectsGrowth: r.collectsGrowth } : {}),
    ...(r.payment !== undefined ? { payment: r.payment } : {}),
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.miningTaxAssignments.bulkPut(records),
  bulkDeleteLocal: (ids) => db.miningTaxAssignments.bulkDelete(ids),
};

// ---------------------------------------------------------------------------
// Production Log sync (issue #525): one CollectionSpec for the run itself,
// plus one each for its two linking-record collections. Each linking record
// is its own document (see ProductionSaleLinkRecord/ProductionOrderWatchRecord
// doc comments in @/db for why), so this is three plain CollectionSpecs, not
// one with a nested array — ordinary mergeRecords LWW-per-document already
// gives each allocation its own independent merge, no special-casing needed.
// ---------------------------------------------------------------------------

const productionRunSpec: CollectionSpec<ProductionRunRecord, RemoteProductionRunDoc> = {
  name: 'productionRuns',
  tombstoneKey: productionRunTombstonesKey,
  loadLocal: (characterId) => db.productionRuns.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    buildPlanId: r.buildPlanId,
    productTypeID: r.productTypeID,
    quantity: r.quantity,
    materialCost: r.materialCost,
    jobFee: r.jobFee,
    totalCost: r.totalCost,
    loggedAt: r.loggedAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    buildPlanId: r.buildPlanId,
    productTypeID: r.productTypeID,
    quantity: r.quantity,
    materialCost: r.materialCost,
    jobFee: r.jobFee,
    totalCost: r.totalCost,
    loggedAt: r.loggedAt,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.productionRuns.bulkPut(records),
  bulkDeleteLocal: (ids) => db.productionRuns.bulkDelete(ids),
};

const productionSaleLinkSpec: CollectionSpec<
  ProductionSaleLinkRecord,
  RemoteProductionSaleLinkDoc
> = {
  name: 'productionSaleLinks',
  tombstoneKey: productionSaleLinkTombstonesKey,
  loadLocal: (characterId) =>
    db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    // Firestore rejects undefined values, so a manual entry's absent
    // transactionId is omitted rather than sent as null.
    ...(r.transactionId !== undefined ? { transactionId: r.transactionId } : {}),
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    linkedAt: r.linkedAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    ...(r.transactionId !== undefined ? { transactionId: r.transactionId } : {}),
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    linkedAt: r.linkedAt,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.productionSaleLinks.bulkPut(records),
  bulkDeleteLocal: (ids) => db.productionSaleLinks.bulkDelete(ids),
};

const productionOrderWatchSpec: CollectionSpec<
  ProductionOrderWatchRecord,
  RemoteProductionOrderWatchDoc
> = {
  name: 'productionOrderWatches',
  tombstoneKey: productionOrderWatchTombstonesKey,
  loadLocal: (characterId) =>
    db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    orderId: r.orderId,
    unitPrice: r.unitPrice,
    initialVolumeRemain: r.initialVolumeRemain,
    lastKnownVolumeRemain: r.lastKnownVolumeRemain,
    closed: r.closed,
    watchedAt: r.watchedAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    orderId: r.orderId,
    unitPrice: r.unitPrice,
    initialVolumeRemain: r.initialVolumeRemain,
    lastKnownVolumeRemain: r.lastKnownVolumeRemain,
    closed: r.closed,
    watchedAt: r.watchedAt,
    updatedAt: r.updatedAt,
  }),
  bulkPutLocal: (records) => db.productionOrderWatches.bulkPut(records),
  bulkDeleteLocal: (ids) => db.productionOrderWatches.bulkDelete(ids),
};

/**
 * Delete a Production Run locally + tombstone, cascading to every sale link
 * and order watch that names it (issue #525) — an allocation left pointing at
 * a run that no longer exists is worse than a slightly noisier tombstone
 * list, and would otherwise linger forever in "already linked" checks.
 */
export async function markProductionRunDeleted(characterId: number, runId: string): Promise<void> {
  const [saleLinks, orderWatches] = await Promise.all([
    db.productionSaleLinks.where('runId').equals(runId).toArray(),
    db.productionOrderWatches.where('runId').equals(runId).toArray(),
  ]);
  await recordBulkDeletion(
    characterId,
    saleLinks.map((l) => l.id),
    productionSaleLinkTombstonesKey(characterId),
    (ids) => db.productionSaleLinks.bulkDelete(ids)
  );
  await recordBulkDeletion(
    characterId,
    orderWatches.map((w) => w.id),
    productionOrderWatchTombstonesKey(characterId),
    (ids) => db.productionOrderWatches.bulkDelete(ids)
  );
  await recordDeletion(characterId, runId, productionRunTombstonesKey(characterId), () =>
    db.productionRuns.delete(runId)
  );
}

/**
 * Unlink a past sale from a Production Run. Tombstoned like every other
 * deletion here, so it doesn't resurrect from a device that hasn't synced
 * the removal yet and silently re-attribute the sale.
 */
export async function removeProductionSaleLink(characterId: number, linkId: string): Promise<void> {
  await recordDeletion(characterId, linkId, productionSaleLinkTombstonesKey(characterId), () =>
    db.productionSaleLinks.delete(linkId)
  );
}

/** Stop watching an open sell order for a Production Run — same tombstone reasoning as removeProductionSaleLink. */
export async function removeProductionOrderWatch(
  characterId: number,
  watchId: string
): Promise<void> {
  await recordDeletion(characterId, watchId, productionOrderWatchTombstonesKey(characterId), () =>
    db.productionOrderWatches.delete(watchId)
  );
}

// ---------------------------------------------------------------------------
// Notification Feed sync (issue #362)
//
// Deliberate departure from CollectionSpec: this collection has no
// tombstones (dismissal is a flag — see NotificationFeedRecord.dismissedAt)
// and its LWW field is `dismissedAt` alone, not a whole-record `updatedAt`
// (content never changes once a row is fired). merge.ts's `mergeFeed` encodes
// that directly rather than forcing it through mergeRecords' delete-aware
// shape.
//
// CONTEXT.md round 45 describes device-detected rows as eventually uploading
// through the same callable Scheduled Push Projections use (issue #358),
// once that callable exists. It doesn't yet (#358 is still open, gated on
// #356/#357). Until then this uses the same ownerHash two-way sync every
// other Editable-Data-shaped collection here uses — the backend (once #358
// ships) can still write pushed rows into this same
// characters/{uid}/notificationFeed collection with admin privileges, which
// bypasses these rules entirely, so the two approaches aren't in conflict.
// ---------------------------------------------------------------------------

const NOTIFICATION_FEED_COLLECTION = 'notificationFeed';

/** Remote Firestore doc at /characters/{uid}/notificationFeed/{id}. */
interface RemoteNotificationFeedDoc extends RemoteFeedDoc {
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  eveType?: string;
}

function toRemoteFeedDoc(row: NotificationFeedRecord, ownerHash: string): Record<string, unknown> {
  return {
    id: row.id,
    characterId: row.characterId,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    firedAt: row.firedAt,
    ...(row.eveType !== undefined ? { eveType: row.eveType } : {}),
    ...(row.dismissedAt !== undefined ? { dismissedAt: row.dismissedAt } : {}),
    ownerHash,
  };
}

/**
 * `local` is this device's own copy, present only when a pull is carrying an
 * existing row's dismissal across (`mergeFeed`'s `pullDismiss`). The merge
 * itself is `features/notifications/feed.mergeFeedRecord`'s — a pull must not
 * be the one writer that re-dates a row.
 */
function toLocalFeedRecord(
  remote: RemoteNotificationFeedDoc,
  local?: NotificationFeedRecord
): NotificationFeedRecord {
  return mergeFeedRecord(local, {
    id: remote.id,
    characterId: remote.characterId,
    eventId: remote.eventId,
    title: remote.title,
    body: remote.body,
    firedAt: remote.firedAt,
    ...(remote.eveType !== undefined ? { eveType: remote.eveType } : {}),
    ...(remote.dismissedAt !== undefined ? { dismissedAt: remote.dismissedAt } : {}),
  });
}

async function syncFeed(ctx: SyncContext): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, NOTIFICATION_FEED_COLLECTION);
  const remote = await fetchOwnedDocs<RemoteNotificationFeedDoc>(col, ctx.ownerHash);
  // Feed rows for every Character share one local table (NotificationFeedPanel
  // shows them together); only this Character's own rows sync to its uid.
  const local = (await readFeed()).filter((row) => row.characterId === ctx.characterId);
  const pushEligible = new Set(rowsWithinSyncWindow(local, ctx.now).map((row) => row.id));

  const plan = mergeFeed<NotificationFeedRecord, RemoteNotificationFeedDoc>(
    local,
    pushEligible,
    remote
  );

  await Promise.all(
    [...plan.pushCreate, ...plan.pushDismiss].map((row) =>
      setDoc(doc(col, row.id), toRemoteFeedDoc(row, ctx.ownerHash))
    )
  );

  const localById = new Map(local.map((row) => [row.id, row]));
  const pulled = [...plan.pullCreate, ...plan.pullDismiss].map((row) =>
    toLocalFeedRecord(row, localById.get(row.id))
  );
  if (pulled.length > 0) {
    await db.notificationFeed.bulkPut(pulled);
    // Excluding what this pull just wrote, or a back-dated row would be
    // trimmed on arrival and pulled again on the next sync, forever.
    await trimFeed(new Set(pulled.map((row) => row.id)));
    await refreshAppBadge();
  }
}

async function syncCharacter(characterId: number): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}`);
  await handleOwnerHashChange(character);
  // A purge deferred by an earlier removal (features/character/removeCharacter)
  // because the refresh token was dead at the time — retry now that this
  // Character has authenticated again. No-op the moment nothing is pending.
  await retryPendingRemotePurge(characterId);

  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  const ownerHash = character.ownerHash;
  const now = Date.now();
  const ctx: SyncContext = { firestore, uid, ownerHash, characterId, now };

  await syncEditableCollection(skillPlanSpec, ctx);
  await syncEditableCollection(buildPlanSpec, ctx);
  await syncEditableCollection(quickbarSpec, ctx);
  await syncEditableCollection(stationPinSpec, ctx);
  await syncEditableCollection(planetRichnessSpec, ctx);
  await syncEditableCollection(productionRunSpec, ctx);
  await syncEditableCollection(productionSaleLinkSpec, ctx);
  await syncEditableCollection(productionOrderWatchSpec, ctx);
  await syncEditableCollection(payeeSpec, ctx);
  await syncEditableCollection(miningTaxAssignmentSpec, ctx);
  await syncFeed(ctx);

  // ---- Synced settings ----
  const settingsCol = collection(firestore, 'characters', uid, 'settings');
  const snapshot = await getDocs(query(settingsCol, where('ownerHash', '==', ownerHash)));
  // Only honour well-formed synced keys: a hostile or stale doc naming a
  // non-synced Dexie key ('activeCharacterId') or an internal 'sync.__' key
  // must never reach Dexie.
  const remoteSettings = snapshot.docs
    .map((d) => d.data() as RemoteSyncedSetting)
    .filter((s) => typeof s.key === 'string' && isSyncedSettingKey(s.key));
  const meta = await readSettingsMeta();
  const settingsTombstones = await readSettingsTombstones();
  const localSettings: SyncedSettingValue[] = (await db.settings.toArray())
    .filter((record) => isSyncedSettingKey(record.key))
    .map((record) => ({ key: record.key, value: record.value, updatedAt: meta[record.key] ?? 0 }));

  const settings = mergeSettings(localSettings, settingsTombstones, remoteSettings, now);
  let metaDirty = false;

  await Promise.all([
    ...settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) {
        meta[s.key] = updatedAt;
        metaDirty = true;
      }
      return setDoc(doc(settingsCol, s.key), {
        key: s.key,
        value: s.value,
        updatedAt,
        ownerHash,
        deleted: false,
      });
    }),
    ...settings.pushTombstones.map((t) =>
      // No `value` field — Firestore rejects undefined, and a tombstone carries none.
      setDoc(doc(settingsCol, t.key), {
        key: t.key,
        updatedAt: t.deletedAt,
        ownerHash,
        deleted: true,
      })
    ),
    ...settings.purgeRemote.map((key) => deleteDoc(doc(settingsCol, key))),
  ]);

  for (const s of settings.pull) {
    await db.settings.put({ key: s.key, value: s.value });
    meta[s.key] = s.updatedAt;
    metaDirty = true;
  }
  for (const key of settings.deleteLocal) {
    await db.settings.delete(key);
    if (key in meta) {
      delete meta[key];
      metaDirty = true;
    }
  }
  if (metaDirty) await writeSettingsMeta(meta);

  // Do NOT also clear on settings.pushTombstones: a tombstone that was just
  // pushed is not yet resolved — see mergeSettings for why it must survive
  // until a remote write postdates the delete.
  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }
}
