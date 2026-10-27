/**
 * The return leg: which outstanding hauls run the lane a given haul runs, only
 * backwards (issue #941). Flying home empty is what hauling economics is
 * actually about, and the board today can only be asked about it by re-typing
 * both region filters by hand.
 *
 * Region to region, which is coarse on purpose. Station-level pairing would be
 * precise and, at this corpus size — the live pull behind ADR 0013 put every
 * public courier contract in New Eden under 620 rows — almost always empty.
 * "Somewhere in Domain back to somewhere in The Forge" is a prompt to go look,
 * not a matched return trip, and the copy above it says so.
 *
 * Built on `filterCourierContracts` rather than beside it: the reverse lane is
 * the hauler's own search with two fields swapped, so a second matching rule
 * here would be a second definition of what a region filter means.
 */
import {
  filterCourierContracts,
  type CourierContractFilter,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';

export interface ReverseLaneMatches {
  /** The hauls running the lane backwards, under the same filter as the board. */
  matches: CourierRouteRow[];
  /**
   * Hauls leaving the right region whose drop-off nothing local places, so the
   * lane cannot be measured for them either way.
   *
   * Kept apart from `matches` rather than folded in or dropped. A region-to-
   * region match needs both regions, and only an *origin* gets a fallback from
   * the contract's own column (`loadCourierEndpoints`), so a return haul
   * delivering to a player structure is systematically unmatchable — not
   * absent. Reporting it as a plain zero would read as "nobody is hauling
   * back" where the truth is "we cannot tell".
   */
  unplaceable: CourierRouteRow[];
}

/**
 * This haul's return leg, or `null` when it has none to look up — either end
 * being a location nothing local places leaves no region to swap, and the
 * caller must say that rather than show a count of zero.
 *
 * `filter` is the board's current filter, passed through untouched except for
 * the two region fields. Everything the hauler narrowed by — what their hold
 * takes, what collateral they will put up, how long they are given — is as
 * true of the way home as of the way out.
 */
export function reverseLaneMatches(
  row: CourierRouteRow,
  rows: readonly CourierRouteRow[],
  filter: CourierContractFilter
): ReverseLaneMatches | null {
  const from = row.destination.regionId;
  const to = row.origin.regionId;
  // `to` cannot be null out of `resolveCourierRoutes`, which falls an unplaced
  // pickup back to the contract's own region column. Guarded anyway because the
  // type permits it and a caller building rows by hand would otherwise pair the
  // lane against `undefined`.
  if (from === null || to === null) return null;

  const notThisHaul = (candidate: CourierRouteRow) => candidate.contractId !== row.contractId;

  return {
    matches: filterCourierContracts(rows, {
      ...filter,
      originRegionId: from,
      destinationRegionId: to,
    }).filter(notThisHaul),
    // A second pass rather than a split of the first, because the two questions
    // cannot share one filter. An end nothing local places has no region *and*
    // no space band, and those co-vary: asked with the hauler's band filter
    // still on, `filterCourierContracts` drops every band-less destination
    // before we could count it, and `unplaceable` would read zero exactly when
    // it has something to say. A band filter cannot apply to a row with no
    // band, so it is lifted here — the question is "what leaves this region for
    // somewhere we cannot place", and the band is the unanswerable part.
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
