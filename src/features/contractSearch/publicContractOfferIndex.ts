/**
 * The Public Contract Offers index (issue #2921), read from R2 (ADR 0019): per
 * listed item type, how many offers and the cheapest ask, plus every region
 * with an offer. Small enough to arrive in one read, which is what lets the
 * Items board suggest item names and fill its region list before any offers
 * have landed — and fetch only the objects of the item actually being searched.
 *
 * R2 is the only store (issue #4270). An unreachable or invalid index with
 * nothing cached reads as `null`, and so does a failed object read: the board
 * then shows its "unavailable" state.
 */
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
  /** The R2 index as read: a type's offers are read from the objects it names. */
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

/** `null` when there is no usable index; never throws. */
export async function loadOfferIndex(): Promise<OfferIndex | null> {
  const r2 = await loadR2OfferIndex();
  return r2 ? offerIndexFromR2(r2.data) : null;
}

/**
 * The offers of just these types, from the R2 objects the index names, or of
 * every type when `typeIds` is `null`; `null` when a read failed.
 */
export function loadOffersForTypes(
  index: OfferIndex,
  typeIds: ReadonlySet<number> | null
): Promise<PublicContractOfferRow[] | null> {
  return typeIds === null ? loadR2AllRows(index.r2) : loadR2TypeRows(index.r2, typeIds);
}
