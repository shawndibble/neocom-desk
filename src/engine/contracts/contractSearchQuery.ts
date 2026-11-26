import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  addToOfferStats,
  offerPassesFilter,
  sortableOfferPrice,
  type ContractOfferFilter,
  type ContractOfferStats,
} from '@/engine/contracts/contractSearch';
import { withinJumpRange } from '@/engine/route/jumpRange';

export interface ContractOfferQuery {
  filter: ContractOfferFilter;
  typeIds: ReadonlySet<number> | null;
  allowedSystems: ReadonlySet<number> | null;
  locationSystems: ReadonlyMap<number, number | null>;
  sort: boolean;
}

export interface ContractOfferQueryResult {
  indices: Uint32Array;
  stats: Map<number, ContractOfferStats>;
}

export function queryContractOffers(
  rows: readonly PublicContractOfferRow[],
  { filter, typeIds, allowedSystems, locationSystems, sort }: ContractOfferQuery
): ContractOfferQueryResult {
  const plexPrice = filter.plexPrice ?? null;
  const stats = new Map<number, ContractOfferStats>();
  const passing: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!offerPassesFilter(row, filter)) continue;
    if (allowedSystems !== null) {
      const system = locationSystems.get(row.locationId);
      if (system !== undefined && !withinJumpRange(system, allowedSystems)) continue;
    }
    addToOfferStats(stats, row, plexPrice);
    if (typeIds === null || typeIds.has(row.typeId)) passing.push(i);
  }
  const indices = Uint32Array.from(passing);
  if (sort) {
    const keys = new Float64Array(rows.length);
    for (const i of passing) keys[i] = sortableOfferPrice(rows[i], plexPrice);
    indices.sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0));
  }
  return { indices, stats };
}
