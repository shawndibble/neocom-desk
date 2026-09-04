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
 * not, and there the union is the reading that loses nothing. It is also
 * order-independent, which is what makes two devices adding the same alt
 * converge instead of racing to different states.
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
import type { StationPinRecord } from '@/db';

/**
 * One account-wide collection, for `ACCOUNT_WIDE_COLLECTIONS` below.
 *
 * Deliberately two functions rather than a `CollectionSpec`-shaped record:
 * that type is ten fields because it describes remote document
 * round-tripping, and none of that is needed to copy a local row sideways.
 * All this needs to know is which rows are account-wide, and how to re-key one
 * onto another Character.
 */
interface AccountWideCollection<T extends { id: string }> {
  /** Every account-scoped row held by any Character other than `exceptCharacterId`. */
  loadShared(exceptCharacterId: number): Promise<T[]>;
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
  cloneOnto: (row, characterId) => ({
    ...row,
    id: `${characterId}:${row.locationId}`,
    characterId,
  }),
  bulkPut: (rows) => db.stationPins.bulkPut(rows),
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
const ACCOUNT_WIDE_COLLECTIONS: AccountWideCollection<never>[] = [
  stationPins as AccountWideCollection<never>,
];

async function backfillCollection<T extends { id: string }>(
  collection: AccountWideCollection<T>,
  characterId: number
): Promise<boolean> {
  const shared = await collection.loadShared(characterId);
  if (shared.length === 0) return false;

  // Union across Characters, deduped by what the row means rather than by
  // which Character holds it. Newest stamp wins a tie, matching merge.ts's
  // last-write-wins rather than inventing a second policy for the same data.
  const newestByKey = new Map<string, T & { updatedAt: number }>();
  for (const row of shared as (T & { updatedAt: number })[]) {
    const key = collection.sharedKey(row);
    const held = newestByKey.get(key);
    if (!held || row.updatedAt > held.updatedAt) newestByKey.set(key, row);
  }

  // A row this Character already holds came from its own sync pull, which has
  // already been merged; that copy is authoritative and is left alone.
  const existing = await collection.existingIds(characterId);
  const toWrite = [...newestByKey.values()]
    .map((row) => collection.cloneOnto(row, characterId))
    .filter((row) => !existing.has(row.id));

  if (toWrite.length === 0) return false;
  await collection.bulkPut(toWrite);
  return true;
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
  for (const collection of ACCOUNT_WIDE_COLLECTIONS) {
    if (await backfillCollection(collection, characterId)) wrote = true;
  }
  return wrote;
}
