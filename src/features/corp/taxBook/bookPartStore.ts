/**
 * This device's Dexie copy of the parts of an officer's Corp Tax Book other
 * than `observed` (#5243): each under the version stamp it was read at, so a
 * reload with an unchanged stamp reads none of them. Officer-only data at rest:
 * wiped with the `observed` copy (observedStore.ts), and one book at a time.
 */
import { db } from '@/db';
import { dropOtherBooks } from './observedStore';
import type { PartStore } from './bookCache';

/** Dexie being unavailable costs the copy, never the read. */
const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

/** The persistent side of `cachedPart` for one Character's book. */
export function bookPartStore(characterId: number, corporationId: number): PartStore {
  return {
    load: async (slot) => {
      const r = await quietly(() => db.corpBookParts.get([characterId, corporationId, slot]));
      return r && { version: r.version, at: r.at, data: r.data };
    },
    save: async (slot, copy) => {
      await quietly(async () => {
        await db.transaction(
          'rw',
          [db.corpBookParts, db.corpBookObservedMeta, db.corpBookObserved],
          async () => {
            await dropOtherBooks(characterId, corporationId);
            await db.corpBookParts.put({ characterId, corporationId, slot, ...copy });
          }
        );
      });
    },
    forget: async (slot) => {
      await quietly(() => db.corpBookParts.delete([characterId, corporationId, slot]));
    },
  };
}
