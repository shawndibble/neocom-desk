import type { SpaceKind } from '@/engine/space';

export interface PublicCourierContractRow {
  contractId: number;
  regionId: number;
  originLocationId: number;
  destinationLocationId: number;
  reward: number;
  volume: number;
  collateral?: number;
  daysToComplete?: number;
  dateExpired: number;
}

export interface CourierEndpoint {
  locationId: number;
  name: string | null;
  systemName: string | null;
  systemId: number | null;
  regionId: number | null;
  security: number | null;
  space: SpaceKind | null;
  resolution: EndpointResolution;
  hasStargates: boolean | null;
}

export type EndpointResolution = 'station' | 'structure' | 'unknown';

export interface CourierRouteRow extends PublicCourierContractRow {
  origin: CourierEndpoint;
  destination: CourierEndpoint;
}

function endpointFor(
  locationId: number,
  endpoints: ReadonlyMap<number, CourierEndpoint>,
  fallbackRegionId: number | null
): CourierEndpoint {
  const resolved = endpoints.get(locationId);
  if (resolved) return resolved;
  return {
    locationId,
    name: null,
    systemName: null,
    systemId: null,
    regionId: fallbackRegionId,
    security: null,
    space: null,
    resolution: 'unknown',
    hasStargates: null,
  };
}

export function resolveCourierRoutes(
  rows: readonly PublicCourierContractRow[],
  endpoints: ReadonlyMap<number, CourierEndpoint>
): CourierRouteRow[] {
  return rows.map((row) => ({
    ...row,
    origin: endpointFor(row.originLocationId, endpoints, row.regionId),
    destination: endpointFor(row.destinationLocationId, endpoints, null),
  }));
}

export interface CourierContractFilter {
  originRegionId?: number | null;
  destinationRegionId?: number | null;
  minReward?: number | null;
  maxCollateral?: number | null;
  maxVolume?: number | null;
  minDaysToComplete?: number | null;
  routeQuery?: string | null;
  destinationSpace?: readonly SpaceKind[] | null;
}

export function courierCollateral(row: PublicCourierContractRow): number {
  return row.collateral ?? 0;
}

function endpointMatches(endpoint: CourierEndpoint, needle: string): boolean {
  return (
    (endpoint.name?.toLowerCase().includes(needle) ?? false) ||
    (endpoint.systemName?.toLowerCase().includes(needle) ?? false)
  );
}

export function filterCourierContracts(
  rows: readonly CourierRouteRow[],
  filter: CourierContractFilter
): CourierRouteRow[] {
  const needle = filter.routeQuery?.trim().toLowerCase() ?? '';
  return rows.filter((row) => {
    if (filter.originRegionId != null && row.origin.regionId !== filter.originRegionId) {
      return false;
    }
    if (
      filter.destinationRegionId != null &&
      row.destination.regionId !== filter.destinationRegionId
    ) {
      return false;
    }
    if (
      filter.destinationSpace != null &&
      (row.destination.space === null || !filter.destinationSpace.includes(row.destination.space))
    ) {
      return false;
    }
    if (filter.minReward != null && row.reward < filter.minReward) return false;
    if (filter.maxCollateral != null && courierCollateral(row) > filter.maxCollateral) return false;
    if (filter.maxVolume != null && row.volume > filter.maxVolume) return false;
    if (
      filter.minDaysToComplete != null &&
      row.daysToComplete != null &&
      row.daysToComplete < filter.minDaysToComplete
    ) {
      return false;
    }
    if (
      needle !== '' &&
      !endpointMatches(row.origin, needle) &&
      !endpointMatches(row.destination, needle)
    ) {
      return false;
    }
    return true;
  });
}
