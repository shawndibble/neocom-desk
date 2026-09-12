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
 * single chunk doc. That is why the panel reads it on mount rather than on the
 * first Courier click — deferring it would buy nothing and cost a fetch on the
 * way in. It is read *separately* from the offers snapshot, though: see
 * `ContractSearchPanel.tsx` for why pairing the two was the wrong trade.
 */
import {
  loadChunkedSnapshot,
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

export function loadPublicCourierContracts(
  characterId: number
): Promise<ChunkedSnapshotRead<PublicCourierContractRow>> {
  return loadChunkedSnapshot<PublicCourierContractRow>(SOURCE, characterId);
}
