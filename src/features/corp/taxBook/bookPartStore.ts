import { db } from '@/db';
import { currentWipeEpoch, dropOtherBooks } from './observedStore';
import type { PartStore } from './bookCache';

const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

export function bookPartStore(characterId: number, corporationId: number): PartStore {
  const epoch = currentWipeEpoch();
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
            if (currentWipeEpoch() !== epoch) return;
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
