/**
 * Reads the Public Contract Offers snapshot (issues #906, #908, ADR 0013)
 * whole — every for-sale line of a public item_exchange/auction contract, any
 * item type — for the Contracts page's Item search tab.
 *
 * The sibling of `features/bpcContracts/syncedContracts.ts`, which reads the
 * same Firestore collection but narrows it to blueprint copies as it goes.
 * The two are separate reads with separate cache entries on purpose; see
 * `docs/context/decisions/` for #908 on why the alternative (one shared
 * full-size cache entry, with BPC Search narrowing from it) was not taken.
 *
 * The chunk/meta layout, the global cache sentinel and the staleness window
 * all live in `chunkedSnapshot.ts`, shared with the courier snapshot beside
 * this one (#910) — what is only true of *this* collection is the three
 * values below.
 */
import {
  OFFERS_CACHE_KEY,
  loadChunkedSnapshot,
  type ChunkedSnapshotRead,
  type ChunkedSnapshotSource,
} from '@/features/contractSearch/chunkedSnapshot';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadR2OfferIndex } from '@/features/contractSearch/r2OfferSnapshot';

const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'publicContractOffers',
  /**
   * Deliberately *not* `publicContractOffers` — that key is BPC Search's, and
   * it holds the blueprint-only narrowing of this same collection. Two
   * different payload shapes under one key is a corrupt cache, not a shared
   * one.
   */
  cacheKey: OFFERS_CACHE_KEY,
  /** How often the backend republishes the snapshot. */
  staleAfterMs: 30 * 60_000,
};

/** The whole snapshot from the Firestore chunks: the fallback when R2 is unreachable. */
export function loadFirestoreContractOffers(
  characterId: number
): Promise<ChunkedSnapshotRead<PublicContractOfferRow>> {
  return loadChunkedSnapshot<PublicContractOfferRow>(SOURCE, characterId);
}

/**
 * The snapshot's freshness, and its rows only when R2 is unreachable (ADR 0019,
 * issue #3746). While R2's index is readable the rows are not downloaded here at
 * all: the Items board reads the types a search names through the index
 * (`publicContractOfferIndex.ts`), so this answers with no rows and the index's
 * own `lastSyncedAt`, which the header reports.
 */
export async function loadPublicContractOffers(
  characterId: number
): Promise<ChunkedSnapshotRead<PublicContractOfferRow>> {
  const r2 = await loadR2OfferIndex();
  if (!r2) return loadFirestoreContractOffers(characterId);
  return {
    cached: { ...r2, data: { rows: [], lastSyncedAt: r2.data.lastSyncedAt } },
    revalidating: false,
  };
}
