import type { R2SnapshotRead } from '@/features/contractSearch/r2Snapshot';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadR2OfferIndex } from '@/features/contractSearch/r2OfferSnapshot';

export async function loadPublicContractOffers(): Promise<R2SnapshotRead<PublicContractOfferRow>> {
  const r2 = await loadR2OfferIndex();
  if (!r2) return { cached: null, revalidating: false };
  return {
    cached: { ...r2, data: { rows: [], lastSyncedAt: r2.data.lastSyncedAt } },
    revalidating: false,
  };
}
