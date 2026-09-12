/**
 * Reads the Public Courier Contracts snapshot (issue #909) whole — every
 * outstanding public courier contract as a route and a fee — for the
 * Contracts page's Search tab (issue #910).
 *
 * The sibling of `publicContractOffers.ts` beside it; the chunk/meta layout
 * and the caching trade the two share live in `chunkedSnapshot.ts`.
 *
 * Far smaller than the offers snapshot: ADR 0013's live pull put courier and
 * loan contracts together under 620 against ~370k offer rows, so this is a
 * single chunk doc. That is why the panel loads it alongside the offers
 * snapshot unconditionally rather than per mode — deferring it to the first
 * Courier click would buy nothing and cost a fetch on the way in.
 */
import {
  loadChunkedSnapshot,
  type ChunkedSnapshot,
  type ChunkedSnapshotRead,
  type ChunkedSnapshotSource,
} from '@/features/contractSearch/chunkedSnapshot';
import type { PublicCourierContractRow } from '@/engine/contracts/courierSearch';

const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'publicCourierContracts',
  /** Its own key: three payload shapes across these collections, three entries. */
  cacheKey: 'publicCourierContracts',
  /** Published by the same job as the offers snapshot, so the same window. */
  staleAfterMs: 30 * 60_000,
};

export type PublicCourierContractsSnapshot = ChunkedSnapshot<PublicCourierContractRow>;

export function loadPublicCourierContracts(
  characterId: number
): Promise<ChunkedSnapshotRead<PublicCourierContractRow>> {
  return loadChunkedSnapshot<PublicCourierContractRow>(SOURCE, characterId);
}
