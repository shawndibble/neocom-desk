/**
 * Pure search over the shared Public Courier Contracts snapshot — every
 * outstanding public courier contract as a route and a fee (issues #909,
 * #910). The hauling sibling of `contractSearch.ts`, which searches the
 * item_exchange/auction corpus.
 *
 * Separate from that filter rather than folded into it, for the same reason
 * `contractSearch.ts` itself stayed out of `bpcSearch.ts`: a courier contract
 * sells nothing, so it has no type, no quantity and no price, and the two
 * filters overlap on nothing but expiry. Merging them would produce a filter
 * whose every field is unanswerable by half its rows — the "filter with a
 * mode flag" shape the offers filter was written to avoid. See
 * `docs/context/decisions/` for #910.
 *
 * Sorting is left to `DataTable`'s column sort, same as both siblings — this
 * only narrows the row set.
 */

/**
 * One row of the shared snapshot: an outstanding public courier contract.
 * Mirrors `functions/src/publicContracts.ts`'s `PublicCourierContractRow`,
 * which this module never imports (client and Functions are separate
 * packages).
 *
 * `collateral` and `daysToComplete` are absent rather than zero when the
 * contract does not state them, which is the distinction the filters below
 * turn on — an absent collateral is a haul that asks for nothing, an absent
 * deadline is a figure the snapshot does not carry.
 */
export interface PublicCourierContractRow {
  contractId: number;
  /** The region the contract was posted in — the pickup end. */
  regionId: number;
  /** Where the haul is picked up (`start_location_id`). */
  originLocationId: number;
  /** Where it has to be delivered (`end_location_id`). */
  destinationLocationId: number;
  /** ISK paid on delivery. */
  reward: number;
  /** m³ of packaged cargo. */
  volume: number;
  /** ISK the hauler puts up, when the contract asks for any. */
  collateral?: number;
  /** Deadline once accepted, in days, when the contract states one. */
  daysToComplete?: number;
  /** Epoch ms. */
  dateExpired: number;
}

/**
 * One end of a haul, resolved as far as the local SDE snapshots reach.
 *
 * Every field is nullable because resolution is best-effort *and free*: an
 * NPC station is named out of `stations.json` with no request at all, and a
 * player structure is not in that file by definition. Resolving those would
 * cost one `/universe/structures/{id}` per id against an ACL that usually
 * refuses — hundreds of 404/403s against ESI's 100-errors-per-minute budget,
 * which is the exact probe `sde/npcStations.ts` exists to remove. So an
 * unresolved endpoint stays `null` and the UI shows its id: "don't know",
 * never "has no name".
 */
export interface CourierEndpoint {
  locationId: number;
  /** Station name, or `null` for a location nothing local names. */
  name: string | null;
  systemName: string | null;
  /**
   * The solar system this end sits in — what a stargate route is measured
   * between, and `null` for the same player-structure case that leaves the
   * name null. A haul with either end unplaced has no distance, which is why
   * the table shows those rows as unavailable rather than as zero jumps.
   */
  systemId: number | null;
  regionId: number | null;
}

/** A courier row with both ends resolved — what the filters and the table read. */
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
  return { locationId, name: null, systemName: null, systemId: null, regionId: fallbackRegionId };
}

/**
 * Attaches each row's endpoints once, up front, so every filter pass and
 * every table cell below reads a plain field rather than re-walking a lookup
 * map. Pure: the caller builds `endpoints` from the SDE snapshots.
 *
 * An unresolved *origin* still gets a region — `regionId` on the row is the
 * contract's own region, which is where it was posted and therefore where the
 * pickup is. A destination has no such column, so an unresolved one is
 * genuinely unplaced.
 */
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
  /** Where the hauler is now. */
  originRegionId?: number | null;
  /** Where they are willing to end up. */
  destinationRegionId?: number | null;
  /** The floor under what the job pays. */
  minReward?: number | null;
  /** The ceiling on what the hauler has to put up. */
  maxCollateral?: number | null;
  /** What the ship can actually carry, in m³. */
  maxVolume?: number | null;
  /** The least time the hauler is willing to be given to deliver. */
  minDaysToComplete?: number | null;
  /** Free text matched against either end's station or system name. */
  routeQuery?: string | null;
}

/**
 * What a collateral ceiling judges a row on. An absent column is a contract
 * that asks for no collateral — zero, not unknown — so it sits under every
 * ceiling rather than being excluded from one.
 */
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
    // An unresolved endpoint has no region, and "unknown" is not a match:
    // claiming it sits in the asked-for region would put a haul on a route
    // list it may not belong to.
    if (filter.originRegionId != null && row.origin.regionId !== filter.originRegionId) {
      return false;
    }
    if (
      filter.destinationRegionId != null &&
      row.destination.regionId !== filter.destinationRegionId
    ) {
      return false;
    }
    if (filter.minReward != null && row.reward < filter.minReward) return false;
    if (filter.maxCollateral != null && courierCollateral(row) > filter.maxCollateral) return false;
    if (filter.maxVolume != null && row.volume > filter.maxVolume) return false;
    // Unknowable passes, the same rule `contractSearch.ts` applies to an
    // auction with no buyout: a contract that states no deadline is not a
    // contract with a short one.
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
