/**
 * This device's Dexie copy of a member's own lines of a Corp Tax Book (#5243),
 * each part under the version stamp it was read at, so a reload with an
 * unchanged stamp reads none of it. Own lines only (`uid`/`uids` queries), so
 * unlike an officer's copy (bookPartStore.ts) it is not one-book-at-a-time.
 * A copy of a book the Character left lives until that book reads as hidden. It
 * shares the `corpBookParts` table under a `member:` slot prefix, and so
 * the Character-removal wipe (`clearObservedCopies`) and the logout wipe.
 */
import { db } from '@/db';
import { currentWipeEpoch } from '@/features/corp/taxBook/observedStore';
import { forgetMemoryCopies, type PartStore } from '@/features/corp/taxBook/bookCache';

const PREFIX = 'member:';

/** Dexie being unavailable costs the copy, never the read. */
const quietly = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await work();
  } catch {
    return undefined;
  }
};

/** The persistent side of `cachedPart` for one Character's own lines of one book. */
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
        // A wipe (removal) since this load began: a read still in flight stays unsaved.
        if (currentWipeEpoch() !== epoch) return;
        await db.corpBookParts.put({ characterId, corporationId, slot: id(slot)[2], ...copy });
      });
    },
    forget: async (slot) => {
      await quietly(() => db.corpBookParts.delete(id(slot)));
    },
  };
}

/** Drops every member part of this Character's copy of one book (the book is gone or hidden), here and in this tab. */
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
