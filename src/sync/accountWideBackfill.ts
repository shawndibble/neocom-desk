import type { EntityTable } from 'dexie';
import { db } from '@/db';
import type { PlanetRichnessRecord, StationPinRecord } from '@/db';
import type { SyncRecord } from './merge';
import { readTombstones, tombstoneKey } from './localBookkeeping';
import { PLANET_RICHNESS, STATION_PINS } from './syncedCollections';

interface AccountWideCollection<T extends SyncRecord> {
  loadShared(exceptCharacterId: number): Promise<T[]>;
  deletedAtByKey(): Promise<Map<string, number>>;
  sharedKey(row: T): string;
  cloneOnto(row: T, characterId: number): T;
  bulkPut(rows: T[]): Promise<unknown>;
  existingIds(characterId: number): Promise<Set<string>>;
  inWriteTransaction<R>(run: () => Promise<R>): Promise<R>;
}

type TombstoneCollection = Parameters<typeof tombstoneKey>[0];

function makeAccountWideCollection<
  T extends SyncRecord & { id: string; characterId: number },
>(opts: {
  table: EntityTable<T, 'id'>;
  tombstones: TombstoneCollection;
  sharedKey: (row: T) => string;
  filter?: (row: T) => boolean;
  cloneOnto: (row: T, characterId: number) => T;
}): AccountWideCollection<T> {
  const { table, tombstones, sharedKey, filter, cloneOnto } = opts;
  return {
    loadShared: async (exceptCharacterId) => {
      const rows = await table.toArray();
      return rows.filter(
        (row) => (filter ? filter(row) : true) && row.characterId !== exceptCharacterId
      );
    },
    sharedKey,
    deletedAtByKey: async () => {
      const characters = await db.characters.toCollection().primaryKeys();
      const latest = new Map<string, number>();
      const lists = await Promise.all(
        characters.map((characterId) =>
          readTombstones(tombstoneKey(tombstones, Number(characterId)))
        )
      );
      for (const tombstone of lists.flat()) {
        const key = tombstone.id.split(':')[1];
        if (!key) continue;
        const held = latest.get(key) ?? 0;
        if (tombstone.deletedAt > held) latest.set(key, tombstone.deletedAt);
      }
      return latest;
    },
    cloneOnto,
    bulkPut: (rows) => table.bulkPut(rows),
    inWriteTransaction: (run) => db.transaction('rw', table, run),
    existingIds: async (characterId) => {
      const rows = await table.where('characterId').equals(characterId).toArray();
      return new Set(rows.map((row) => row.id));
    },
  };
}

const stationPins = makeAccountWideCollection<StationPinRecord>({
  table: db.stationPins,
  tombstones: STATION_PINS,
  filter: (row) => row.scope === 'account',
  sharedKey: (row) => String(row.locationId),
  cloneOnto: (row, characterId) => ({
    ...row,
    id: `${characterId}:${row.locationId}`,
    characterId,
  }),
});

const planetRichness = makeAccountWideCollection<PlanetRichnessRecord>({
  table: db.planetRichness,
  tombstones: PLANET_RICHNESS,
  sharedKey: (row) => String(row.planetId),
  cloneOnto: (row, characterId) => ({
    ...row,
    id: `${characterId}:${row.planetId}`,
    characterId,
    order: [...row.order],
  }),
});

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

  const deletedAt = await collection.deletedAtByKey();
  const newestByKey = new Map<string, T>();
  for (const row of shared) {
    const key = collection.sharedKey(row);
    if (row.updatedAt < (deletedAt.get(key) ?? 0)) continue;
    const held = newestByKey.get(key);
    if (!held || row.updatedAt > held.updatedAt) newestByKey.set(key, row);
  }

  const candidates = [...newestByKey.values()];
  if (candidates.length === 0) return false;

  return collection.inWriteTransaction(async () => {
    const existing = await collection.existingIds(characterId);
    const toWrite = candidates
      .map((row) => collection.cloneOnto(row, characterId))
      .filter((row) => !existing.has(row.id));

    if (toWrite.length === 0) return false;
    await collection.bulkPut(toWrite);
    return true;
  });
}

export async function backfillAccountWideData(characterId: number): Promise<boolean> {
  let wrote = false;
  for (const backfill of ACCOUNT_WIDE_COLLECTIONS) {
    if (await backfill(characterId)) wrote = true;
  }
  return wrote;
}
