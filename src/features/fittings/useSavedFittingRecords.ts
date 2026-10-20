/** The Character's saved Fittings (Dexie), live; `undefined` until the first read. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type FittingRecord } from '@/db';

export function useSavedFittingRecords(characterId: number | null): FittingRecord[] | undefined {
  return useLiveQuery(
    () =>
      characterId === null
        ? Promise.resolve([] as FittingRecord[])
        : db.fittings.where('characterId').equals(characterId).toArray(),
    [characterId]
  );
}
