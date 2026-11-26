import { db } from '@/db';
import type { LocalTombstone } from './merge';
import { EDITABLE_COLLECTIONS, type EditableCollection } from './syncedCollections';
import { uidForCharacter } from './uid';

export const INTERNAL_PREFIX = 'sync.__';

export const ownerHashKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}ownerHash.${characterId}`;

export const heartbeatKey = (uid: string): string => `${INTERNAL_PREFIX}heartbeatAt.${uid}`;
export const tombstoneKey = (
  collection: Pick<EditableCollection, 'tombstoneSegment'>,
  characterId: number
): string => `${INTERNAL_PREFIX}${collection.tombstoneSegment}.${characterId}`;

export const settingsSeenSeqKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}settingsSeenSeq.${characterId}`;

const PULL_CURSOR_PREFIX = `${INTERNAL_PREFIX}pullCursor.`;
export const pullCursorKey = (characterId: number, collectionName: string): string =>
  `${PULL_CURSOR_PREFIX}${characterId}.${collectionName}`;

export interface PullCursor {
  high: number;
  fullAt: number;
}

export const syncMarkerKey = (characterId: number): string =>
  `${INTERNAL_PREFIX}syncMarker.${characterId}`;

export interface SeenSyncMarker {
  version: number;
  fullAt: number;
}

export async function readSeenSyncMarker(characterId: number): Promise<SeenSyncMarker | undefined> {
  const value = (await db.settings.get(syncMarkerKey(characterId)))?.value as
    Partial<SeenSyncMarker> | undefined;
  if (typeof value?.version !== 'number' || typeof value?.fullAt !== 'number') return undefined;
  return { version: value.version, fullAt: value.fullAt };
}

export async function writeSeenSyncMarker(
  characterId: number,
  seen: SeenSyncMarker
): Promise<void> {
  await db.settings.put({ key: syncMarkerKey(characterId), value: seen });
}

export async function advanceSeenSyncMarker(
  characterId: number,
  expected: SeenSyncMarker
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const stored = await readSeenSyncMarker(characterId);
    if (stored?.version !== expected.version || stored.fullAt !== expected.fullAt) return;
    await writeSeenSyncMarker(characterId, { ...expected, version: expected.version + 1 });
  });
}

export async function clearSeenSyncMarker(characterId: number): Promise<void> {
  await db.settings.delete(syncMarkerKey(characterId));
}

export async function readPullCursor(key: string): Promise<PullCursor | undefined> {
  const value = (await db.settings.get(key))?.value as Partial<PullCursor> | undefined;
  if (typeof value?.high !== 'number' || typeof value?.fullAt !== 'number') return undefined;
  return { high: value.high, fullAt: value.fullAt };
}

export async function writePullCursor(key: string, cursor: PullCursor): Promise<void> {
  await db.settings.put({ key, value: cursor });
}

export async function clearPullCursors(characterId: number): Promise<void> {
  await db.settings.where('key').startsWith(`${PULL_CURSOR_PREFIX}${characterId}.`).delete();
  await clearSeenSyncMarker(characterId);
}

export async function readTombstones(key: string): Promise<LocalTombstone[]> {
  const record = await db.settings.get(key);
  return Array.isArray(record?.value) ? (record.value as LocalTombstone[]) : [];
}

export async function appendTombstones(key: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  const replaced = new Set(ids);
  const remaining = (await readTombstones(key)).filter((t) => !replaced.has(t.id));
  await db.settings.put({
    key,
    value: [...remaining, ...ids.map((id) => ({ id, deletedAt: now }))],
  });
}

export async function removeTombstones(key: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const dropped = new Set(ids);
  const held = await readTombstones(key);
  const remaining = held.filter((t) => !dropped.has(t.id));
  if (remaining.length !== held.length) await db.settings.put({ key, value: remaining });
}

export async function clearCharacterSyncBookkeeping(characterId: number): Promise<void> {
  await db.settings.bulkDelete([
    ownerHashKey(characterId),
    heartbeatKey(uidForCharacter(characterId)),
    settingsSeenSeqKey(characterId),
    ...EDITABLE_COLLECTIONS.map((collection) => tombstoneKey(collection, characterId)),
  ]);
  await clearPullCursors(characterId);
}
