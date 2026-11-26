import {
  filterCourierContracts,
  type CourierContractFilter,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';

export interface ReverseLaneMatches {
  matches: CourierRouteRow[];
  unplaceable: CourierRouteRow[];
}

export function reverseLaneMatches(
  row: CourierRouteRow,
  rows: readonly CourierRouteRow[],
  filter: CourierContractFilter
): ReverseLaneMatches | null {
  const from = row.destination.regionId;
  const to = row.origin.regionId;
  if (from === null || to === null) return null;

  const notThisHaul = (candidate: CourierRouteRow) => candidate.contractId !== row.contractId;

  return {
    matches: filterCourierContracts(rows, {
      ...filter,
      originRegionId: from,
      destinationRegionId: to,
    }).filter(notThisHaul),
    unplaceable: filterCourierContracts(rows, {
      ...filter,
      originRegionId: from,
      destinationRegionId: null,
      destinationSpace: null,
    })
      .filter(notThisHaul)
      .filter((candidate) => candidate.destination.regionId === null),
  };
}
