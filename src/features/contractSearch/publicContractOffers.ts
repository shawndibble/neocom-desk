/**
 * Reads the Public Contract Offers snapshot (issues #906, #908, ADR 0013)
 * whole — every for-sale line of a public item_exchange/auction contract, any
 * item type — for the Contracts page's Search tab.
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
  loadChunkedSnapshot,
  type ChunkedSnapshot,
  type ChunkedSnapshotSource,
} from '@/features/contractSearch/chunkedSnapshot';
import type { CachedResult } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

const SOURCE: ChunkedSnapshotSource = {
  collectionName: 'publicContractOffers',
  /**
   * Deliberately *not* `publicContractOffers` — that key is BPC Search's, and
   * it holds the blueprint-only narrowing of this same collection. Two
   * different payload shapes under one key is a corrupt cache, not a shared
   * one.
   */
  cacheKey: 'publicContractOffersAll',
  /** How often the backend republishes the snapshot. */
  staleAfterMs: 30 * 60_000,
};

export type PublicContractOffersSnapshot = ChunkedSnapshot<PublicContractOfferRow>;

export function loadPublicContractOffers(
  characterId: number
): Promise<CachedResult<PublicContractOffersSnapshot> | null> {
  return loadChunkedSnapshot<PublicContractOfferRow>(SOURCE, characterId);
}
