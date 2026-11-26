import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  loadR2AllRows,
  loadR2OfferIndex,
  loadR2TypeRows,
  type R2OfferIndex,
} from './r2OfferSnapshot';

export interface OfferIndexType {
  typeId: number;
  count: number;
  cheapest: number | null;
}

export interface OfferIndex {
  lastSyncedAt: number;
  types: ReadonlyMap<number, OfferIndexType>;
  regionIds: readonly number[];
  r2: R2OfferIndex;
}

export function offerIndexFromR2(raw: R2OfferIndex): OfferIndex {
  const types = new Map<number, OfferIndexType>();
  for (const [key, { count, cheapest }] of Object.entries(raw.types)) {
    const typeId = Number(key);
    types.set(typeId, { typeId, count, cheapest });
  }
  return { lastSyncedAt: raw.lastSyncedAt, types, regionIds: raw.regionIds, r2: raw };
}

export async function loadOfferIndex(): Promise<OfferIndex | null> {
  const r2 = await loadR2OfferIndex();
  return r2 ? offerIndexFromR2(r2.data) : null;
}

export function loadOffersForTypes(
  index: OfferIndex,
  typeIds: ReadonlySet<number> | null
): Promise<PublicContractOfferRow[] | null> {
  return typeIds === null ? loadR2AllRows(index.r2) : loadR2TypeRows(index.r2, typeIds);
}
