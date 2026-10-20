/**
 * The Public Contract Offers snapshot's freshness (issues #906, #908, ADR 0013)
 * for the Contracts page's Item search tab.
 *
 * The rows themselves are never downloaded whole: R2 is the only store (ADR
 * 0019, issue #4270) and the Items board reads the types a search names
 * through the index (`publicContractOfferIndex.ts`). The sibling
 * `features/bpcContracts/syncedContracts.ts` reads the blueprint-copy slice of
 * the same R2 snapshot.
 */
import type { R2SnapshotRead } from '@/features/contractSearch/r2Snapshot';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadR2OfferIndex } from '@/features/contractSearch/r2OfferSnapshot';

/**
 * No rows and the index's own `lastSyncedAt`, which the header reports. R2
 * unreachable with nothing cached reads as `cached: null` — the panel's
 * "unavailable" state; there is no other source to fall back to.
 */
export async function loadPublicContractOffers(): Promise<R2SnapshotRead<PublicContractOfferRow>> {
  const r2 = await loadR2OfferIndex();
  if (!r2) return { cached: null, revalidating: false };
  return {
    cached: { ...r2, data: { rows: [], lastSyncedAt: r2.data.lastSyncedAt } },
    revalidating: false,
  };
}
