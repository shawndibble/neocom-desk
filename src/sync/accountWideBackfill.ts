/**
 * Copy account-wide Editable Data onto a Character added after it was created
 * (issue #432, CONTEXT.md round 52).
 *
 * ## Why this has to exist at all
 *
 * Account-wide Editable Data has no shared account identity to key a single
 * record off — Account has no storage, sync or server-side identity — so
 * round 7 settled that it **fans out**: one row per Character known on this
 * device, each synced under that Character's own ownerHash (parity plan
 * §5.7). `setAccountStationPin` in `./planSync.ts` is that write.
 *
 * "Known on this device" is the whole of it, and it is a snapshot taken at
 * write time. A Character added afterwards is not in it, so an account-wide
 * pin made last month simply does not exist for an alt added today. This
 * module is the other half: at add time, copy what the account already holds
 * onto the newcomer.
 *
 * ## Union, not a chosen source Character
 *
 * In steady state every Character holds the identical account-row set —
 * `setAccountStationPin` writes to all of them and `clearStationPin`
 * tombstones all of them — so "copy from Character X" and "copy the union of
 * all Characters" are the same answer. They diverge only on a partially
 * synced device, where one Character's rows have arrived and another's have
 * not. It is also order-independent, which is what makes two devices adding
 * the same alt converge instead of racing to different states.
 *
 * ## A copied row can outlive a deletion, and why the tombstone check exists
 *
 * The union trusts a local row, and a local row can be behind. That matters
 * more than it looks. `cloneOnto` re-keys the row to `${newCharacterId}:...`,
 * an id **no per-id tombstone anywhere targets** — tombstones are per
 * Character and written only for the Characters that existed when the delete
 * happened. So `merge.ts` would see `l && !r` and push it as a brand-new
 * remote doc that nothing can out-rank, and `pinStateForStation` reports
 * `'account'` if *any* Character holds an account row.
 *
 * `deletedAtByKey` closes the case this device can actually see: a candidate
 * row older than a deletion any local Character has recorded is skipped
 * outright, so the copy never happens. A device that has pulled neither the
 * deletion nor its tombstone cannot be closed here — nothing local says the
 * row is stale — but issue #436 closes it one layer up instead of leaving it
 * a permanent resurrection: `stationPinDeletedAtByKey`/
 * `planetRichnessDeletedAtByKey` below feed the same map into `mergeRecords`'
 * `accountWide` check (`planSync.ts`), which self-heals an already-copied
 * stale row the moment any sibling Character's own sync learns the deletion —
 * see `docs/context/decisions/20260904-231339-account-wide-deletions-get-a-shared-key-tombstone.md`.
 *
 * ## The copied row keeps its original `updatedAt`
 *
 * This is load-bearing, not tidiness. `./merge.ts` is last-write-wins, and it
 * compares a row's `updatedAt` against a tombstone's `deletedAt` (`r.updatedAt
 * > t.deletedAt`). A Character being added here may already exist on another
 * device, with its own tombstones for pins the user deleted there. A row
 * stamped `Date.now()` would out-rank every one of those tombstones and
 * resurrect the deletions on the next sync. Carrying the source row's stamp
 * keeps the comparison honest: a deletion that happened after the pin was
 * made still wins, exactly as it would have without this backfill.
 */

import { db } from '@/db';
import type { PlanetRichnessRecord, StationPinRecord } from '@/db';
import type { SyncRecord } from './merge';
import {
  planetRichnessTombstonesKey,
  readTombstones,
  stationPinTombstonesKey,
} from './localBookkeeping';

/**
 * One account-wide collection, for `ACCOUNT_WIDE_COLLECTIONS` below.
 *
 * Deliberately two functions rather than a `CollectionSpec`-shaped record:
 * that type is ten fields because it describes remote document
 * round-tripping, and none of that is needed to copy a local row sideways.
 * All this needs to know is which rows are account-wide, and how to re-key one
 * onto another Character.
 */
interface AccountWideCollection<T extends SyncRecord> {
  /** Every account-scoped row held by any Character other than `exceptCharacterId`. */
  loadShared(exceptCharacterId: number): Promise<T[]>;
  /**
   * The latest moment any Character on this device recorded a deletion of the
   * account state `sharedKey` names, or 0 when none did. A candidate row older
   * than this is a row that has not caught up with a deletion, and copying it
   * would push the deleted state back out — see the module header.
   */
  deletedAtByKey(): Promise<Map<string, number>>;
  /**
   * What makes two rows the same piece of account state, ignoring which
   * Character happens to hold them — the key the union dedupes on.
   */
  sharedKey(row: T): string;
  /** The same row, re-keyed as `characterId`'s own copy. */
  cloneOnto(row: T, characterId: number): T;
  bulkPut(rows: T[]): Promise<unknown>;
  /** Ids `characterId` already holds, so an existing row is never clobbered. */
  existingIds(characterId: number): Promise<Set<string>>;
  /**
   * Run the read-then-write half under one Dexie transaction, so a concurrent
   * sync pull or an unpin from the UI cannot land between the "what does this
   * Character already hold" read and the write that trusts it.
   */
  inWriteTransaction<R>(run: () => Promise<R>): Promise<R>;
}

const stationPins: AccountWideCollection<StationPinRecord> = {
  // Whole-table read, filtered in memory: `scope` is not a Dexie index, and
  // adding one would mean a schema version bump for a table that holds a
  // handful of rows per Character.
  loadShared: async (exceptCharacterId) => {
    const rows = await db.stationPins.toArray();
    return rows.filter((row) => row.scope === 'account' && row.characterId !== exceptCharacterId);
  },
  sharedKey: (row) => String(row.locationId),
  // Tombstones are per Character and keyed by that Character's own row id
  // (`${characterId}:${locationId}`), so the locationId is recovered from the
  // id's second segment to compare across Characters.
  deletedAtByKey: async () => {
    const characters = await db.characters.toCollection().primaryKeys();
    const latest = new Map<string, number>();
    for (const characterId of characters) {
      for (const tombstone of await readTombstones(stationPinTombstonesKey(Number(characterId)))) {
        const locationId = tombstone.id.split(':')[1];
        if (!locationId) continue;
        const held = latest.get(locationId) ?? 0;
        if (tombstone.deletedAt > held) latest.set(locationId, tombstone.deletedAt);
      }
    }
    return latest;
  },
  cloneOnto: (row, characterId) => ({
    ...row,
    id: `${characterId}:${row.locationId}`,
    characterId,
  }),
  bulkPut: (rows) => db.stationPins.bulkPut(rows),
  inWriteTransaction: (run) => db.transaction('rw', db.stationPins, run),
  existingIds: async (characterId) => {
    const rows = await db.stationPins.where('characterId').equals(characterId).toArray();
    return new Set(rows.map((row) => row.id));
  },
};

/**
 * Every collection the fan-out writes account-wide.
 *
 * One entry today. It stays an array because #425's resource-richness
 * ordering is the second, and the round 7 fan-out is this app's standing
 * recipe for any account-wide collection after that — but it should not grow
 * machinery ahead of those callers.
 */
// Each entry is a thunk so the type parameter is erased at the call rather
// than by a cast. `AccountWideCollection<never>[]` with an `as` would type-check
// every entry vacuously — a collection missing `updatedAt` would compile, and
// its rows would then compare `undefined > undefined` and quietly make the
// union order-dependent.
/**
 * A planet's resource ranking (issue #425). Account-wide with no per-Character
 * variant at all — a planet's richness is the same fact for every Character —
 * so unlike `stationPins` there is no `scope` to filter on: every row is
 * shared by definition.
 */
const planetRichness: AccountWideCollection<PlanetRichnessRecord> = {
  loadShared: async (exceptCharacterId) => {
    const rows = await db.planetRichness.toArray();
    return rows.filter((row) => row.characterId !== exceptCharacterId);
  },
  sharedKey: (row) => String(row.planetId),
  deletedAtByKey: async () => {
    const characters = await db.characters.toCollection().primaryKeys();
    const latest = new Map<string, number>();
    for (const characterId of characters) {
      for (const tombstone of await readTombstones(
        planetRichnessTombstonesKey(Number(characterId))
      )) {
        const planetId = tombstone.id.split(':')[1];
        if (!planetId) continue;
        const held = latest.get(planetId) ?? 0;
        if (tombstone.deletedAt > held) latest.set(planetId, tombstone.deletedAt);
      }
    }
    return latest;
  },
  cloneOnto: (row, characterId) => ({
    ...row,
    id: `${characterId}:${row.planetId}`,
    characterId,
    // Copied, not shared: two Characters' rows must not alias one array, or
    // reordering one would silently reorder the other.
    order: [...row.order],
  }),
  bulkPut: (rows) => db.planetRichness.bulkPut(rows),
  existingIds: async (characterId) => {
    const rows = await db.planetRichness.where('characterId').equals(characterId).toArray();
    return new Set(rows.map((row) => row.id));
  },
  inWriteTransaction: (run) => db.transaction('rw', db.planetRichness, run),
};

/**
 * Exposed so `planSync.ts` can feed the same signal into `mergeRecords`'
 * `accountWide` check (issue #436) — closing the resurrection this module's
 * own copy step cannot always prevent (see the module header's "A copied row
 * can outlive a deletion" section) once the deletion is *learned*, not just
 * when it is copied.
 */
export const stationPinDeletedAtByKey = stationPins.deletedAtByKey;
export const planetRichnessDeletedAtByKey = planetRichness.deletedAtByKey;

const ACCOUNT_WIDE_COLLECTIONS: ((characterId: number) => Promise<boolean>)[] = [
  (characterId) => backfillCollection(stationPins, characterId),
  (characterId) => backfillCollection(planetRichness, characterId),
];

async function backfillCollection<T extends SyncRecord>(
  collection: AccountWideCollection<T>,
  characterId: number
): Promise<boolean> {
  const shared = await collection.loadShared(characterId);
  if (shared.length === 0) return false;

  // Union across Characters, deduped by what the row means rather than by
  // which Character holds it. Newest stamp wins a tie, matching merge.ts's
  // last-write-wins rather than inventing a second policy for the same data.
  const deletedAt = await collection.deletedAtByKey();
  const newestByKey = new Map<string, T>();
  for (const row of shared) {
    const key = collection.sharedKey(row);
    // A row this device knows was deleted after it was written is stale. It
    // must not be copied: the copy lands under an id no tombstone targets, so
    // merge.ts would push it as a brand-new remote doc and resurrect it.
    if (row.updatedAt < (deletedAt.get(key) ?? 0)) continue;
    const held = newestByKey.get(key);
    if (!held || row.updatedAt > held.updatedAt) newestByKey.set(key, row);
  }

  const candidates = [...newestByKey.values()];
  if (candidates.length === 0) return false;

  return collection.inWriteTransaction(async () => {
    // A row this Character already holds came from its own sync pull, which has
    // already been merged; that copy is authoritative and is left alone. Read
    // and write are one transaction so nothing lands between them.
    const existing = await collection.existingIds(characterId);
    const toWrite = candidates
      .map((row) => collection.cloneOnto(row, characterId))
      .filter((row) => !existing.has(row.id));

    if (toWrite.length === 0) return false;
    await collection.bulkPut(toWrite);
    return true;
  });
}

/**
 * Give a newly-added Character the account-wide Editable Data the rest of the
 * account already holds.
 *
 * Writes nothing when this is the first Character on the device, when no
 * account-wide rows exist yet, or when this Character already holds every one
 * of them.
 *
 * Like `setSyncedSetting`, this leaves scheduling to the caller — pair it with
 * `scheduleSync(characterId)` when it returns true. That keeps this module
 * free of any import from `./index`, which would be a cycle, and free of
 * `./planSync`, which would drag Firebase into a module that only touches
 * Dexie.
 *
 * Call this only for a Character genuinely new to this device. It is
 * deliberately not called on a token refresh, and not for a sold Character
 * re-authenticating under a new ownerHash: that Character's Editable Data was
 * just purged on purpose by `handleOwnerHashChange`, and re-seeding it here
 * would undo that.
 *
 * @returns Whether anything was written, so the caller knows to schedule a sync.
 */
export async function backfillAccountWideData(characterId: number): Promise<boolean> {
  let wrote = false;
  for (const backfill of ACCOUNT_WIDE_COLLECTIONS) {
    if (await backfill(characterId)) wrote = true;
  }
  return wrote;
}
