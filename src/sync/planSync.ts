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
// Syncs are serialized GLOBALLY, not just per character: the Firebase session is
// a single slot swapped by ensureSignedIn, so two concurrent syncs would race
// the auth state mid-flight. Status is tracked per character so a later
// character's success cannot mask an earlier one's failure. Within one
// character's sync the collections pull concurrently (syncCharacter). Queued
// syncs start foreground-first (SyncPriority), so an edit never waits behind a
// whole background sweep.
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
  type CharacterRecord,
  type NotificationFeedRecord,
  type PlanetRichnessRecord,
  type StationPinRecord,
} from '@/db';
import { planetRichnessDeletedAtByKey, stationPinDeletedAtByKey } from './accountWideBackfill';
import { purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import {
  FEED_SYNC_WINDOW_MS,
  mergeFeedRecord,
  readFeed,
  rowsWithinSyncWindow,
  trimFeed,
} from '@/features/notifications/feed';
import { refreshAppBadge } from '@/features/notifications/appBadge';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { getSyncFirestore } from './firebaseApp';
import {
  INTERNAL_PREFIX,
  appendTombstones,
  heartbeatKey,
  ownerHashKey,
  readTombstones,
  tombstoneKey,
  clearPullCursors,
  pullCursorKey,
  readPullCursor,
  writePullCursor,
  type PullCursor,
} from './localBookkeeping';
import { setStatus } from './status';
import { ensureSignedIn } from './syncAuth';
import {
  mergeFeed,
  mergeRecords,
  mergeSettings,
  TOMBSTONE_TTL_MS,
  type LocalTombstone,
  type RemoteDoc,
  type RemoteFeedDoc,
  type RemoteSyncedSetting,
  type SyncedSettingTombstone,
  type SyncedSettingValue,
} from './merge';
import { isAllowedSyncedSettingKey } from './syncedSettings';
import {
  BUILD_PLANS,
  EDITABLE_COLLECTIONS,
  FITTINGS,
  NOTIFICATION_FEED,
  PLANET_RICHNESS,
  PRODUCTION_ORDER_WATCHES,
  PRODUCTION_RUNS,
  PRODUCTION_SALE_LINKS,
  SKILL_PLANS,
  STATION_PINS,
  SYNCED_SETTINGS,
  type EditableCollection,
  type EditableRecord,
} from './syncedCollections';

// ---------------------------------------------------------------------------
// Local bookkeeping (Dexie settings table). 'sync.__' keys are internal and
// never synced; 'sync.' keys are the user settings that DO sync.
// ---------------------------------------------------------------------------

const SYNCED_PREFIX = 'sync.';
// Key builders (ownerHashKey, tombstoneKey) live in localBookkeeping.ts,
// Firebase-free, so features/character/removeCharacter.ts can clear them
// without pulling in Firebase.
const SETTINGS_META_KEY = `${INTERNAL_PREFIX}settingsMeta`;
// Synced settings are a single global set (not per-character, like plans), so
// their tombstones live under one global key too — a delete recorded during
// one character's sync must be visible on every other character's pass.
const SETTINGS_TOMBSTONES_KEY = `${INTERNAL_PREFIX}settingsTombstones`;

/**
 * Smallest gap between two `lastSyncedAt` heartbeat writes for one uid. Its
 * one reader, `functions/src/purgeStaleAccounts.ts`, purges after 90 days
 * without one, so a day's granularity costs it nothing.
 */
export const HEARTBEAT_INTERVAL_MS = 24 * 3_600_000;

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
  await appendTombstones(tombstoneKey, [id]);
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
  await appendTombstones(tombstoneKey, ids);
  scheduleSync(characterId);
}

/** Delete a Skill Plan locally + tombstone, so the deletion propagates. */
export async function markPlanDeleted(characterId: number, planId: string): Promise<void> {
  await recordDeletion(characterId, planId, tombstoneKey(SKILL_PLANS, characterId), () =>
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
  await recordDeletion(characterId, planId, tombstoneKey(BUILD_PLANS, characterId), () =>
    db.buildPlans.delete(planId)
  );
}

/**
 * Bulk analogue of markBuildPlanDeleted — a Build Group delete cascading to
 * every member plan. Goes through `recordBulkDeletion` rather than one
 * `markBuildPlanDeleted` call per plan: parallel calls would each do their
 * own read-modify-write of the same tombstone list and race, silently
 * dropping tombstones for all but the last write to land.
 */
export async function markBuildPlansDeleted(characterId: number, planIds: string[]): Promise<void> {
  await recordBulkDeletion(characterId, planIds, tombstoneKey(BUILD_PLANS, characterId), (ids) =>
    db.buildPlans.bulkDelete(ids)
  );
}

/** Fitting analogue of markPlanDeleted — same tombstone semantics (issue #1538). */
export async function markFittingDeleted(characterId: number, fittingId: string): Promise<void> {
  await recordDeletion(characterId, fittingId, tombstoneKey(FITTINGS, characterId), () =>
    db.fittings.delete(fittingId)
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
      recordDeletion(row.characterId, row.id, tombstoneKey(STATION_PINS, row.characterId), () =>
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
      recordDeletion(row.characterId, row.id, tombstoneKey(PLANET_RICHNESS, row.characterId), () =>
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

/**
 * One Character's sync, from the moment it is requested until its promise
 * settles. It may run more than one pass: a request that arrives after a pass
 * has started (`started`) cannot be served by it — the pass may already have
 * read the local rows the request is about — so it sets `rerun` and the job
 * goes back in the queue once the pass ends. Callers keep awaiting the one
 * promise, so `flushSync` (features/character/removeCharacter.ts) never deletes
 * a Character's rows before an edit made mid-pass has actually been pushed.
 */
interface SyncJob {
  characterId: number;
  priority: SyncPriority;
  started: boolean;
  rerun: SyncPriority | null;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const running = new Map<number, SyncJob>();
const pendingTimers = new Map<
  number,
  { timer: ReturnType<typeof setTimeout>; priority: SyncPriority }
>();
const DEFAULT_DEBOUNCE_MS = 2000;

/**
 * `foreground` is everything a user is waiting on — an edit, the boot sync, a
 * Character switch. `background` is the sweep (`app/backgroundSync.ts`), which
 * may queue one sync per Character: a foreground sync overtakes every queued
 * background one, so an edit waits for at most the one sync already in
 * flight, never the whole sweep.
 */
export type SyncPriority = 'foreground' | 'background';

function higher(a: SyncPriority | null, b: SyncPriority): SyncPriority {
  return a === 'foreground' || b === 'foreground' ? 'foreground' : 'background';
}

/** Syncs waiting their turn, FIFO within each priority. */
const queue: SyncJob[] = [];
/** True while a sync holds the (single) Firebase session. */
let busy = false;
// Set by `haltSync` for the rest of the page's life: a purge-then-wipe must
// not race a sync that pushes the purged rows back or re-mints a session.
let halted = false;

function finish(job: SyncJob, error?: { error: unknown }): void {
  if (running.get(job.characterId) === job) running.delete(job.characterId);
  if (error) job.reject(error.error);
  else job.resolve();
}

/**
 * Start the next queued sync — foreground first — unless one is running.
 * After `haltSync` a queued job is settled without running: it would only
 * push data the halt is about to purge.
 */
function pump(): void {
  while (!busy && queue.length > 0) {
    const foreground = queue.findIndex((job) => job.priority === 'foreground');
    const [job] = queue.splice(foreground === -1 ? 0 : foreground, 1);
    if (halted) {
      finish(job);
      continue;
    }
    busy = true;
    job.started = true;
    void runPass(job);
  }
}

async function runPass(job: SyncJob): Promise<void> {
  const { characterId } = job;
  let failure: { error: unknown } | undefined;
  setStatus(characterId, { state: 'syncing', error: null });
  try {
    await syncCharacter(characterId);
    setStatus(characterId, { state: 'idle', lastSyncedAt: Date.now(), error: null });
  } catch (error) {
    failure = { error };
    setStatus(characterId, {
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
    if (job.rerun !== null && !halted) {
      job.priority = job.rerun;
      job.rerun = null;
      job.started = false;
      queue.push(job);
    } else {
      finish(job, failure);
    }
    pump();
  }
}

/**
 * Stop syncing on this page until it reloads: pending debounces are dropped,
 * new syncs are refused, queued ones are skipped, and this resolves once the
 * sync in flight (if any) is done.
 */
export async function haltSync(): Promise<void> {
  halted = true;
  for (const { timer } of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  // Not-yet-started jobs settle now, without running.
  for (const job of queue.splice(0)) finish(job);
  await Promise.allSettled([...running.values()].map((job) => job.promise));
}

/** Undo `haltSync`. Tests only — the app reloads instead. */
export function resetSyncHalt(): void {
  halted = false;
}

/**
 * Debounced sync — call after each edit. `background` is for the sweep only;
 * a foreground call for the same Character inside the debounce wins.
 */
export function scheduleSync(
  characterId: number,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  priority: SyncPriority = 'foreground'
): void {
  if (halted) return;
  const existing = pendingTimers.get(characterId);
  if (existing !== undefined) clearTimeout(existing.timer);
  const merged = higher(existing?.priority ?? null, priority);
  pendingTimers.set(characterId, {
    priority: merged,
    timer: setTimeout(() => {
      pendingTimers.delete(characterId);
      triggerSync(characterId, merged).catch(() => {
        // Failure already surfaced via subscribeSyncStatus.
      });
    }, debounceMs),
  });
}

/**
 * Run a sync now, serialized globally. Coalesced per character: a queued sync
 * for it is awaited instead (promoted to foreground when this call is), and
 * one already running is awaited *through one more pass*, since it may have
 * read the local rows before whatever edit prompted this call.
 */
export function triggerSync(
  characterId: number,
  priority: SyncPriority = 'foreground'
): Promise<void> {
  if (halted) return Promise.resolve();
  const pending = pendingTimers.get(characterId);
  if (pending !== undefined) {
    clearTimeout(pending.timer);
    pendingTimers.delete(characterId);
    priority = higher(pending.priority, priority);
  }
  const existing = running.get(characterId);
  if (existing) {
    if (existing.started) existing.rerun = higher(existing.rerun, priority);
    else existing.priority = higher(existing.priority, priority);
    return existing.promise;
  }

  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const job: SyncJob = {
    characterId,
    priority,
    started: false,
    rerun: null,
    promise,
    resolve,
    reject,
  };
  running.set(characterId, job);
  queue.push(job);
  pump();
  return promise;
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
    // Every editable collection, whatever its removal rule: this is the
    // previous owner's data, not a Character the pilot chose to drop.
    for (const collection of EDITABLE_COLLECTIONS) {
      await db.table(collection.table).where('characterId').equals(character.characterId).delete();
    }
    for (const collection of EDITABLE_COLLECTIONS) {
      await writeTombstones(tombstoneKey(collection, character.characterId), []);
    }
    // The new owner's docs can carry an `updatedAt` below the previous owner's
    // high-water mark, so a surviving cursor would hide them entirely.
    await clearPullCursors(character.characterId);
    // Feed rows themselves survive a transfer (they are this device's archive
    // of what it saw, and carry no tombstones), but the new owner's remote
    // collection has never held any of them — so the claim `syncedAt` makes
    // is now false for every one of them, and leaving it set would keep them
    // off the new uid forever.
    await db.notificationFeed
      .where('characterId')
      .equals(character.characterId)
      .modify((row) => {
        delete row.syncedAt;
      });
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
// Generic editable-collection sync (every EDITABLE_COLLECTIONS declaration)
// ---------------------------------------------------------------------------

/**
 * Account-wide collections only (issue #436): the shared key a deletion is
 * recognized by regardless of which Character's id a row was copied onto,
 * and the current per-key deletion times to check it against. See
 * `AccountWideTombstones` in merge.ts.
 *
 * Merge policy, not part of a collection's declaration: its `deletedAtByKey`
 * comes from accountWideBackfill.ts, which itself reads the registry.
 */
interface AccountWideMerge<L extends EditableRecord> {
  sharedKey: (record: L) => string | undefined;
  deletedAtByKey: () => Promise<Map<string, number>>;
}

/** Pairs a merge hook with its typed declaration, then erases the row type for the lookup below. */
function accountWideMerge<L extends EditableRecord>(
  collection: EditableCollection<L, RemoteDoc & L>,
  merge: AccountWideMerge<L>
): [EditableCollection, AccountWideMerge<EditableRecord>] {
  return [collection as EditableCollection, merge as AccountWideMerge<EditableRecord>];
}

const ACCOUNT_WIDE_MERGES = new Map([
  accountWideMerge<StationPinRecord>(STATION_PINS, {
    // Only an account-wide row can be resurrected onto a Character added
    // after the delete (accountWideBackfill.ts only ever copies `scope:
    // 'account'` rows) — a `character`-scoped pin at the same locationId
    // must not be caught by a deletion that only ever applied to the
    // account-wide one.
    sharedKey: (row) => (row.scope === 'account' ? String(row.locationId) : undefined),
    deletedAtByKey: stationPinDeletedAtByKey,
  }),
  accountWideMerge<PlanetRichnessRecord>(PLANET_RICHNESS, {
    // Every row is account-wide — no per-Character variant exists to opt out.
    sharedKey: (row) => String(row.planetId),
    deletedAtByKey: planetRichnessDeletedAtByKey,
  }),
]);

interface SyncContext {
  firestore: Firestore;
  uid: string;
  ownerHash: string;
  characterId: number;
  now: number;
}

/**
 * The only remote read in the app, and the only reason any field of a synced
 * document is indexed at all.
 *
 * `firestore.indexes.json` exempts every field of every synced collection
 * group from automatic indexing (`fieldPath: "*"`) and re-enables exactly
 * one: `ownerHash` — issue #583, which is what stops Firestore storing an
 * index entry per skill in a plan queue, per Quickbar item and per ore line
 * for queries nobody makes. **So adding a `where(...)` or `orderBy(...)` on
 * any other field here needs that field re-enabled in `fieldOverrides`
 * first, and the exemptions redeployed.** A composite index still covers its
 * own fields (an exemption applies only to automatic indexing), which is how
 * the incremental pull's `updatedAt` filter below works without one.
 *
 * Miss that and the query throws `failed-precondition` at runtime — the same
 * error a missing *composite* index gives, so it reads as one. `isMissingIndex`'s
 * full read is no safety net here either: it filters on `ownerHash` too.
 */
async function fetchOwnedDocs<R extends { ownerHash: string }>(
  col: CollectionReference,
  ownerHash: string,
  since?: number
): Promise<R[]> {
  // Rules allow listing only what the client's where clause provably scopes to;
  // an unfiltered getDocs would also trip over stale-hash docs after a transfer.
  const owned = where('ownerHash', '==', ownerHash);
  const snapshot = await getDocs(
    since === undefined ? query(col, owned) : query(col, owned, where('updatedAt', '>', since))
  );
  return snapshot.docs.map((d) => d.data() as R);
}

// ---------------------------------------------------------------------------
// Incremental pull (issue #581)
//
// Every pass used to re-read every owned doc in all 12 collections — a full
// collection scan each, on app start, on every Character switch and 2s after
// every mutation. Firestore bills per document read, so that cost grows with
// users x mutations x accumulated rows while the stored data barely moves.
//
// So each (Character, collection) carries a pull cursor and the read is
// filtered to `updatedAt > cursor`. Remote tombstones are ordinary docs
// carrying `updatedAt`, so a delete arrives through that window exactly like
// an edit. What a partial remote set costs is the two `mergeRecords`
// decisions that used to read remote *absence* — see its `since` docstring.
//
// The synced *settings* collection deliberately stays a full read: its
// tombstones never expire and `mergeSettings`' absence semantics differ, and
// it is the cheapest of the 12 (bounded by the synced-key allow-list).
// ---------------------------------------------------------------------------

/** How stale a cursor may get before the pass falls back to an unfiltered read. */
const FULL_RECONCILE_INTERVAL_MS = TOMBSTONE_TTL_MS;

interface PullWindow<R> {
  /** The docs to merge: the whole owned set, or only what changed since the cursor. */
  remote: R[];
  /** Lower bound the merge must assume, or `undefined` when this was a full read. */
  since: number | undefined;
  /** Where to store `next`, once the pass has applied everything it read. */
  cursorKey: string;
  next: PullCursor;
}

/**
 * Firestore refuses a composite query whose index is not deployed yet with
 * `failed-precondition`. `firestore.indexes.json` is deployed by hand, so a
 * client running this code before that lands must not simply stop syncing:
 * the pass degrades to the unfiltered read it used to do, and records itself
 * as a full read so nothing is missed.
 */
function isMissingIndex(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'failed-precondition';
}

async function pullOwnedDocs<R extends { ownerHash: string; updatedAt?: number }>(
  col: CollectionReference,
  ctx: SyncContext,
  collectionName: string
): Promise<PullWindow<R>> {
  const cursorKey = pullCursorKey(ctx.characterId, collectionName);
  const cursor = await readPullCursor(cursorKey);
  // No cursor at all = an in-place upgrade, or a fresh device: full read, so
  // pre-existing remote docs can never be missed.
  const fresh = cursor !== undefined && ctx.now - cursor.fullAt <= FULL_RECONCILE_INTERVAL_MS;
  let since = fresh ? cursor.high : undefined;
  let remote: R[];
  try {
    remote = await fetchOwnedDocs<R>(col, ctx.ownerHash, since);
  } catch (err) {
    if (since === undefined || !isMissingIndex(err)) throw err;
    since = undefined;
    remote = await fetchOwnedDocs<R>(col, ctx.ownerHash);
  }
  // The high-water mark actually observed, never `ctx.now` (see PullCursor).
  const observed = remote.reduce((high, d) => Math.max(high, d.updatedAt ?? 0), 0);
  return {
    remote,
    since,
    cursorKey,
    next:
      since === undefined
        ? { high: observed, fullAt: ctx.now }
        : { high: Math.max(since, observed), fullAt: cursor?.fullAt ?? ctx.now },
  };
}

async function syncEditableCollection(spec: EditableCollection, ctx: SyncContext): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, spec.remoteName);
  const pull = await pullOwnedDocs<RemoteDoc>(col, ctx, spec.remoteName);
  const remote = pull.remote;
  const table = db.table<EditableRecord, string>(spec.table);
  const local = await table.where('characterId').equals(ctx.characterId).toArray();
  const tombstonesKey = tombstoneKey(spec, ctx.characterId);
  const tombstones = await readTombstones(tombstonesKey);
  const accountWideHooks = ACCOUNT_WIDE_MERGES.get(spec);
  const accountWide = accountWideHooks
    ? {
        sharedKey: accountWideHooks.sharedKey,
        deletedAtByKey: await accountWideHooks.deletedAtByKey(),
      }
    : undefined;
  const plan = mergeRecords<EditableRecord, RemoteDoc>(
    local,
    tombstones,
    remote,
    ctx.now,
    accountWide,
    pull.since
  );

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
    await table.bulkPut(plan.pullUpserts.map((r) => spec.toLocalRecord(r)));
  }
  if (plan.deleteLocal.length > 0) {
    await table.bulkDelete(plan.deleteLocal);
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
    await writeTombstones(tombstonesKey, [
      ...tombstones.filter((t) => !settled.has(t.id) && !learned.some((l) => l.id === t.id)),
      ...learned,
    ]);
  }

  // Last, and only once every write above landed: a throw mid-pass must leave
  // the cursor where it was so the next pass re-reads the same window.
  await writePullCursor(pull.cursorKey, pull.next);
}

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
  const [saleLinks, orderWatches] = await Promise.all([
    db.productionSaleLinks.where('runId').equals(runId).toArray(),
    db.productionOrderWatches.where('runId').equals(runId).toArray(),
  ]);
  await recordBulkDeletion(
    characterId,
    saleLinks.map((l) => l.id),
    tombstoneKey(PRODUCTION_SALE_LINKS, characterId),
    (ids) => db.productionSaleLinks.bulkDelete(ids)
  );
  await recordBulkDeletion(
    characterId,
    orderWatches.map((w) => w.id),
    tombstoneKey(PRODUCTION_ORDER_WATCHES, characterId),
    (ids) => db.productionOrderWatches.bulkDelete(ids)
  );
  await recordDeletion(characterId, runId, tombstoneKey(PRODUCTION_RUNS, characterId), () =>
    db.productionRuns.delete(runId)
  );
}

/**
 * Unlink a past sale from a Production Run. Tombstoned like every other
 * deletion here, so it doesn't resurrect from a device that hasn't synced
 * the removal yet and silently re-attribute the sale.
 */
export async function removeProductionSaleLink(characterId: number, linkId: string): Promise<void> {
  await recordDeletion(characterId, linkId, tombstoneKey(PRODUCTION_SALE_LINKS, characterId), () =>
    db.productionSaleLinks.delete(linkId)
  );
}

/** Stop watching an open sell order for a Production Run — same tombstone reasoning as removeProductionSaleLink. */
export async function removeProductionOrderWatch(
  characterId: number,
  watchId: string
): Promise<void> {
  await recordDeletion(
    characterId,
    watchId,
    tombstoneKey(PRODUCTION_ORDER_WATCHES, characterId),
    () => db.productionOrderWatches.delete(watchId)
  );
}

// ---------------------------------------------------------------------------
// Notification Feed sync (issue #362)
//
// Deliberate departure from the editable-collection sync: this collection has no
// tombstones (dismissal is a flag — see NotificationFeedRecord.dismissedAt)
// and its LWW field is `dismissedAt` alone, not a whole-record `updatedAt`
// (content never changes once a row is fired). merge.ts's `mergeFeed` encodes
// that directly rather than forcing it through mergeRecords' delete-aware
// shape.
//
// The remote copy is still bounded, though (issue #582): a remote row fired
// more than FEED_SYNC_WINDOW_MS ago is deleted outright — no tombstone, so
// nothing accumulates in its place. The same window that decides what a
// device starts pushing now also decides what stays up there — bounded,
// though, not expired to the day: an aged row's transport stamp no longer
// moves, so an incremental pull skips it and the periodic full reconcile is
// what brings it back into view. Call it 30-60 days. A purged row
// cannot ping-pong back: the purge cutoff and `pushEligible` are both
// derived from the one `ctx.now`, so anything purged is already outside the
// push window, and the device's own 300-row archive keeps the entry
// regardless.
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

const NOTIFICATION_FEED_COLLECTION = NOTIFICATION_FEED.remoteName;

/** Remote Firestore doc at /characters/{uid}/notificationFeed/{id}. */
interface RemoteNotificationFeedDoc extends RemoteFeedDoc {
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  eveType?: string;
  /** The row the alert was about, so the other device's link lands in the same place. */
  subjectId?: number;
  /** `subjectId`'s former name — read for rows written by the release that used it. */
  typeId?: number;
  fillMatch?: NotificationFeedRecord['fillMatch'];
  fillSettledAt?: number;
}

function toRemoteFeedDoc(
  row: NotificationFeedRecord,
  ownerHash: string,
  writeNow: number
): Record<string, unknown> {
  return {
    id: row.id,
    characterId: row.characterId,
    eventId: row.eventId,
    title: row.title,
    body: row.body,
    firedAt: row.firedAt,
    ...(row.eveType !== undefined ? { eveType: row.eveType } : {}),
    ...(row.subjectId !== undefined ? { subjectId: row.subjectId } : {}),
    ...(row.dismissedAt !== undefined ? { dismissedAt: row.dismissedAt } : {}),
    ...(row.fillMatch !== undefined ? { fillMatch: row.fillMatch } : {}),
    ...(row.fillSettledAt !== undefined ? { fillSettledAt: row.fillSettledAt } : {}),
    ownerHash,
    // Transport only — what an incremental pull cursors on (issue #581).
    // `mergeFeed` still keys on firedAt/dismissedAt and never reads this.
    //
    // A wall clock, not the row's own `max(firedAt, dismissedAt)` — see
    // `LocalFeedRow` for why the derived stamp hid rows from other devices.
    // `writeNow`, never `ctx.now`: a pass stamps `ctx.now` before a dozen
    // collections' round trips, and a doc written a minute later under a
    // stamp a minute old can land below a cursor another device has already
    // moved past. Nothing here re-dates the row itself — `firedAt` and
    // `dismissedAt` go up untouched, and stay the only fields `mergeFeed` reads.
    updatedAt: writeNow,
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
  writeNow: number,
  local?: NotificationFeedRecord
): NotificationFeedRecord {
  return mergeFeedRecord(local, {
    // Seen in the remote collection, so the remote side demonstrably holds it
    // — the same fact a successful push records, learned a step later.
    syncedAt: writeNow,
    id: remote.id,
    characterId: remote.characterId,
    eventId: remote.eventId,
    title: remote.title,
    body: remote.body,
    firedAt: remote.firedAt,
    ...(remote.eveType !== undefined ? { eveType: remote.eveType } : {}),
    ...((remote.subjectId ?? remote.typeId) !== undefined
      ? { subjectId: remote.subjectId ?? remote.typeId }
      : {}),
    ...(remote.dismissedAt !== undefined ? { dismissedAt: remote.dismissedAt } : {}),
    ...(remote.fillMatch !== undefined ? { fillMatch: remote.fillMatch } : {}),
    ...(remote.fillSettledAt !== undefined ? { fillSettledAt: remote.fillSettledAt } : {}),
  });
}

async function syncFeed(ctx: SyncContext): Promise<void> {
  const col = collection(ctx.firestore, 'characters', ctx.uid, NOTIFICATION_FEED_COLLECTION);
  const pull = await pullOwnedDocs<RemoteNotificationFeedDoc>(
    col,
    ctx,
    NOTIFICATION_FEED_COLLECTION
  );
  const remote = pull.remote;
  // Feed rows for every Character share one local table (the Alerts page
  // shows them together); only this Character's own rows sync to its uid.
  const local = (await readFeed()).filter((row) => row.characterId === ctx.characterId);
  const pushEligible = new Set(rowsWithinSyncWindow(local, ctx.now).map((row) => row.id));

  const plan = mergeFeed<NotificationFeedRecord, RemoteNotificationFeedDoc>(
    local,
    pushEligible,
    remote,
    ctx.now,
    FEED_SYNC_WINDOW_MS
  );

  const writeNow = Date.now();
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  // A re-date pushes the merge of both copies, not the local row alone: the
  // remote doc is replaced wholesale, and anything only it holds would go.
  const redated = plan.pushRedate.map((row) => {
    const remoteRow = remoteById.get(row.id);
    return remoteRow === undefined ? row : toLocalFeedRecord(remoteRow, writeNow, row);
  });
  const pushed = [...plan.pushCreate, ...plan.pushDismiss, ...redated];
  await Promise.all([
    ...pushed.map((row) => setDoc(doc(col, row.id), toRemoteFeedDoc(row, ctx.ownerHash, writeNow))),
    ...plan.purgeRemote.map((id) => deleteDoc(doc(col, id))),
  ]);

  const localById = new Map(local.map((row) => [row.id, row]));
  // What this pass now knows the remote side holds: what it just wrote, and
  // what it read back unchanged. Without the second half a row both sides
  // already had — one the Scheduled Push handler wrote here and the other
  // device uploaded — would stay unmarked and re-push on every pass.
  //
  // Marked only after the writes land: a `syncedAt` on a row that never
  // reached Firestore is a row this device has silently agreed never to
  // upload again. A throw here leaves it unmarked and the next pass
  // re-pushes, which is the harmless direction to fail in.
  const knownRemote = [
    ...pushed.map((row) => row.id),
    ...remote.map((row) => row.id).filter((id) => localById.has(id)),
  ];
  if (knownRemote.length > 0) {
    await db.notificationFeed.where('id').anyOf(knownRemote).modify({ syncedAt: writeNow });
  }

  const pulled = [...plan.pullCreate, ...plan.pullDismiss, ...plan.pullRedate].map((row) =>
    toLocalFeedRecord(row, writeNow, localById.get(row.id))
  );
  if (pulled.length > 0) {
    await db.notificationFeed.bulkPut(pulled);
    // Excluding what this pull just wrote, or a back-dated row would be
    // trimmed on arrival and pulled again on the next sync, forever.
    await trimFeed(new Set(pulled.map((row) => row.id)));
    await refreshAppBadge();
  }

  await writePullCursor(pull.cursorKey, pull.next);
}

// ---------------------------------------------------------------------------
// Synced settings
// ---------------------------------------------------------------------------

async function syncSettings(ctx: SyncContext): Promise<void> {
  const { firestore, uid, ownerHash, now } = ctx;
  // The second `ownerHash` read, and under the same index constraint as
  // `fetchOwnedDocs` — see its docstring. Deliberately unwindowed: settings
  // tombstones never expire and `mergeSettings`' absence semantics differ.
  const settingsCol = collection(firestore, 'characters', uid, SYNCED_SETTINGS.remoteName);
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
  /** LWW stamps this pass wants to record, applied under the transaction below. */
  const stamps = new Map<string, number>();

  await Promise.all([
    ...settings.push.map((s) => {
      // A key written outside setSyncedSetting has no timestamp yet: stamp now.
      const updatedAt = s.updatedAt > 0 ? s.updatedAt : now;
      if (meta[s.key] !== updatedAt) stamps.set(s.key, updatedAt);
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

  // One transaction for the whole pull rather than a put/delete per key: the
  // rows and their LWW stamps land together, and a live query over settings
  // re-runs once instead of once per row. Dexie only inside it — an awaited
  // Firestore call would let the transaction auto-commit early.
  //
  // The meta is re-read inside it: the merge above worked from a snapshot
  // taken before the network round trips, and a setSyncedSetting /
  // deleteSyncedSetting landing in between must neither be overwritten by the
  // pull nor lose its stamp. A key whose stamp moved since the snapshot is
  // left alone; the next pass merges it properly.
  if (settings.pull.length > 0 || settings.deleteLocal.length > 0 || stamps.size > 0) {
    await db.transaction('rw', db.settings, async () => {
      const current = await readSettingsMeta();
      const untouched = (key: string) => current[key] === meta[key];
      const pull = settings.pull.filter((s) => untouched(s.key));
      const deleteLocal = settings.deleteLocal.filter(untouched);
      let dirty = false;
      for (const [key, updatedAt] of stamps) {
        if (!untouched(key)) continue;
        current[key] = updatedAt;
        dirty = true;
      }
      for (const s of pull) {
        current[s.key] = s.updatedAt;
        dirty = true;
      }
      for (const key of deleteLocal) {
        if (key in current) {
          delete current[key];
          dirty = true;
        }
      }
      if (pull.length > 0) {
        await db.settings.bulkPut(pull.map((s) => ({ key: s.key, value: s.value })));
      }
      if (deleteLocal.length > 0) await db.settings.bulkDelete(deleteLocal);
      if (dirty) await writeSettingsMeta(current);
    });
  }

  // Do NOT also clear on settings.pushTombstones: a tombstone that was just
  // pushed is not yet resolved — see mergeSettings for why it must survive
  // until a remote write postdates the delete.
  if (settings.clearLocalTombstones.length > 0) {
    const cleared = new Set(settings.clearLocalTombstones);
    await writeSettingsTombstones(settingsTombstones.filter((t) => !cleared.has(t.key)));
  }
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

/**
 * Run every task, at most `limit` at a time, and throw only once *all* of them
 * have settled: the one failure as-is, or an `AggregateError` of several.
 * Rejecting early would let the queue start the next Character — and swap the
 * Firebase session — under this one's still-running writes, the race the
 * global serialization exists to prevent.
 */
async function settleAllThenThrow(
  tasks: readonly (() => Promise<void>)[],
  limit: number
): Promise<void> {
  const errors: unknown[] = [];
  await mapWithConcurrencyLimit(tasks, limit, async (task) => {
    try {
      await task();
    } catch (error) {
      errors.push(error);
    }
  });
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    const first = errors[0] instanceof Error ? errors[0].message : String(errors[0]);
    // Every failure kept for whoever inspects it; the message — what the sync
    // status line shows — stays the first one's, with a count.
    throw new AggregateError(errors, `${first} (and ${errors.length - 1} more)`);
  }
}

async function syncCharacter(characterId: number): Promise<void> {
  const character = await db.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}`);
  await handleOwnerHashChange(character);

  const uid = await ensureSignedIn(characterId);
  const firestore = getSyncFirestore();
  const ownerHash = character.ownerHash;
  const now = Date.now();
  const ctx: SyncContext = { firestore, uid, ownerHash, characterId, now };

  // A failing collection no longer stops the ones after it: each collection's
  // cursor only advances on its own success, so what did apply stays applied
  // and the failed one re-reads its window on the next pass.
  await settleAllThenThrow(
    [
      ...EDITABLE_COLLECTIONS.map((spec) => () => syncEditableCollection(spec, ctx)),
      () => syncFeed(ctx),
      () => syncSettings(ctx),
    ],
    COLLECTION_PULL_CONCURRENCY
  );

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
}
