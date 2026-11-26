import { db } from '@/db';
import { currentWipeEpoch } from '@/features/corp/taxBook/observedStore';
import { forgetMemoryCopies, type PartStore } from '@/features/corp/taxBook/bookCache';

const PREFIX = 'member:';

const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

export function memberPartStore(characterId: number, corporationId: number): PartStore {
  const epoch = currentWipeEpoch();
  const id = (slot: string): [number, number, string] => [
    characterId,
    corporationId,
    `${PREFIX}${slot}`,
  ];
  return {
    load: async (slot) => {
      const r = await quietly(() => db.corpBookParts.get(id(slot)));
      return r && { version: r.version, at: r.at, data: r.data };
    },
    save: async (slot, copy) => {
      await quietly(async () => {
        if (currentWipeEpoch() !== epoch) return;
        await db.corpBookParts.put({ characterId, corporationId, slot: id(slot)[2], ...copy });
      });
    },
    forget: async (slot) => {
      await quietly(() => db.corpBookParts.delete(id(slot)));
    },
  };
}

export async function forgetMemberParts(characterId: number, corporationId: number): Promise<void> {
  forgetMemoryCopies(`member:${characterId}:${corporationId}`);
  await quietly(async () => {
    const held = await db.corpBookParts
      .where('[characterId+corporationId]')
      .equals([characterId, corporationId])
      .primaryKeys();
    await db.corpBookParts.bulkDelete(held.filter(([, , slot]) => slot.startsWith(PREFIX)));
  });
}
