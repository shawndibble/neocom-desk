// Device-local Dexie bookkeeping keys the sync driver (planSync.ts) uses to
// track per-Character sync state (owner-hash bookmark, tombstone lists,
// incremental-pull cursors).
// Firebase-free and safe to import synchronously — unlike the rest of
// src/sync, which is deliberately kept behind `await import(...)` (see
// index.ts's code-splitting note) — so this is what lets
// features/character/removeCharacter.ts clean these up on removal without
// pulling in the ~160 KB Firebase bundle.

import { db } from '@/db';
import type { LocalTombstone } from './merge';
import { EDITABLE_COLLECTIONS, type EditableCollection } from './syncedCollections';
import { uidForCharacter } from './uid';

export const INTERNAL_PREFIX = 'sync.__';

export const ownerHashKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}ownerHash.${characterId}`;

/**
 * When this device last wrote the `lastSyncedAt` heartbeat for a sync uid
 * (planSync.ts throttles that write to once a day).
 */
export const heartbeatKey = (uid: string): string => `${INTERNAL_PREFIX}heartbeatAt.${uid}`;
/**
 * One Character's tombstone list for one editable collection:
 * `sync.__<tombstoneSegment>.<characterId>`. The segment is pinned per
 * collection in `syncedCollections.ts`, so keys already on a device keep
 * resolving.
 */
export const tombstoneKey = (
  collection: Pick<EditableCollection, 'tombstoneSegment'>,
  characterId: number
): string => `${INTERNAL_PREFIX}${collection.tombstoneSegment}.${characterId}`;

/**
 * A per-(Character, collection) **pull cursor** (issue #581): where the last
 * incremental read of that remote collection got to.
 *
 * Keyed Character-first so every cursor for one Character shares a prefix and
 * {@link clearPullCursors} can drop them with a single range scan — which also
 * reaches the Notification Feed's cursor, a collection with no tombstones.
 */
export const PULL_CURSOR_PREFIX = `${INTERNAL_PREFIX}pullCursor.`;
export const pullCursorKey = (characterId: number, collectionName: string): string =>
  `${PULL_CURSOR_PREFIX}${characterId}.${collectionName}`;

export interface PullCursor {
  /**
   * Highest `updatedAt` actually observed in a response — never `Date.now()`,
   * so a doc written while the pass was in flight, under a clock that had
   * already run past it, is picked up by the next pass instead of skipped.
   */
  high: number;
  /**
   * Epoch ms of the last *unfiltered* read. A cursor drifts (a write landing
   * with a back-dated `updatedAt`, a device offline past a tombstone TTL), so
   * a full reconcile is forced once this is older than `TOMBSTONE_TTL_MS`.
   * Tracked separately from `high` because `high` is a property of the data,
   * not of this device: on a collection nothing has touched in a year, `high`
   * stays a year old and would otherwise force a full read on every pass.
   */
  fullAt: number;
}

export async function readPullCursor(key: string): Promise<PullCursor | undefined> {
  const value = (await db.settings.get(key))?.value as Partial<PullCursor> | undefined;
  if (typeof value?.high !== 'number' || typeof value?.fullAt !== 'number') return undefined;
  return { high: value.high, fullAt: value.fullAt };
}

export async function writePullCursor(key: string, cursor: PullCursor): Promise<void> {
  await db.settings.put({ key, value: cursor });
}

/**
 * Drop every pull cursor for one Character. Called on an ownerHash change as
 * well as on removal: the new owner's docs can carry an `updatedAt` older than
 * the previous owner's high-water mark, so a surviving cursor would hide them
 * until the next full reconcile.
 */
export async function clearPullCursors(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PULL_CURSOR_PREFIX}${characterId}.`).delete();
}

/**
 * One Character's tombstone list for a collection, by its bookkeeping key.
 *
 * Lives here rather than in planSync.ts so a Firebase-free module can read
 * tombstones — `accountWideBackfill.ts` has to, and importing planSync would
 * drag the ~160 KB Firebase bundle into a Dexie-only path.
 */
export async function readTombstones(key: string): Promise<LocalTombstone[]> {
  const record = await db.settings.get(key);
  return Array.isArray(record?.value) ? (record.value as LocalTombstone[]) : [];
}

/**
 * Records `ids` as deleted now under one tombstone key, replacing any older
 * tombstone for the same id. Dexie-only and Firebase-free, so a feature can
 * call it inside its own `db.transaction` (covering `db.settings`) and have
 * the row deletes and their tombstones commit or fail together. Scheduling
 * the sync that pushes them is the caller's job, after that commit.
 */
export async function appendTombstones(key: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  const remaining = (await readTombstones(key)).filter((t) => !ids.includes(t.id));
  await db.settings.put({
    key,
    value: [...remaining, ...ids.map((id) => ({ id, deletedAt: now }))],
  });
}

/**
 * Drop every device-local sync bookkeeping key for one Character (owner-hash
 * bookmark + every collection's tombstone list). Called when a Character is
 * removed — its skillPlans/buildPlans/quickbars/etc. rows are already gone by
 * then, so there is nothing left for these to describe.
 */
export async function clearCharacterSyncBookkeeping(characterId: number): Promise<void> {
  await db.settings.bulkDelete([
    ownerHashKey(characterId),
    heartbeatKey(uidForCharacter(characterId)),
    ...EDITABLE_COLLECTIONS.map((collection) => tombstoneKey(collection, characterId)),
  ]);
  await clearPullCursors(characterId);
}
