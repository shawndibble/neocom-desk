/**
 * Reads the `lpStoreOffers` snapshot (issue #2873): every LP corporation's
 * offers and station systems, published daily by `syncLpStoreOffers`. The
 * layout and cache-through behaviour are `chunkedSnapshot.ts`'s, shared with
 * the public-contract snapshots; only the collection, cache key and window are
 * this snapshot's own.
 */
import {
  loadChunkedSnapshot,
  type ChunkedSnapshotRead,
  type ChunkedSnapshotSource,
} from '@/features/contractSearch/chunkedSnapshot';
import type { LpSnapshotStore } from './itemSearch';

const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'lpStoreOffers',
  cacheKey: 'lpStoreOffersAll',
  /** The backend republishes once a day. */
  staleAfterMs: 12 * 60 * 60_000,
};

export function loadLpStoreSnapshot(
  characterId: number
): Promise<ChunkedSnapshotRead<LpSnapshotStore>> {
  return loadChunkedSnapshot<LpSnapshotStore>(SOURCE, characterId);
}
