/**
 * The Courier filter's types and pure helpers, split from `CourierFilterBar`
 * so that file exports only components.
 */
import type { CourierRouteRow } from '@/engine/contracts/courierSearch';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import type { OverRateFilter } from '@/features/contractSearch/overRateFilter';

/** The filter as the controls hold it: text fields stay strings until they are parsed into the engine's filter. */
export interface CourierUiFilter {
  routeQuery: string;
  originRegionId: number | null;
  destinationRegionId: number | null;
  /** Which bands the hauler will deliver into; every offered band is "no restriction". */
  destinationSpace: readonly SpaceKind[];
  /** Drop the hauls that may not be deliverable at all. Off is no restriction. */
  hideUncompletable: boolean;
  /** What to do with the hauls paying far above the market's going rate. */
  overRate: OverRateFilter;
  minReward: string;
  maxCollateral: string;
  maxVolume: string;
  minDays: string;
}

/**
 * Only the bands these hauls actually end in — the same rule `regionOptionsFor`
 * below applies to regions, so a chosen band can never land on an empty table.
 *
 * It is not a nicety here. Endpoints are named out of `stations.json`, which
 * holds NPC stations only, and **no NPC station sits in a J-named system**
 * (checked against the shipped snapshot: 0 of 5,210, against 2,597 J-named
 * systems). Wormhole hauls terminate at player structures, which nothing local
 * places at all. So a fixed four-chip row would offer a Wormhole chip that
 * cannot match anything — and, worse, deselecting it would look like a no-op
 * while silently dropping every haul whose destination has no band.
 *
 * Derived from the rows rather than hardcoded, so this corrects itself if the
 * SDE ever does place a station in J-space.
 */
export function offeredSpaceKinds(rows: readonly CourierRouteRow[]): SpaceKind[] {
  return SPACE_KINDS.filter((kind) => rows.some((row) => row.destination.space === kind));
}

/**
 * Whether the hauler has actually narrowed anything. Measured against the bands
 * on offer, not all four: with every offered band selected this must be no
 * filter at all, so a destination that has no band stays visible.
 */
export function narrowsSpace(
  selected: readonly SpaceKind[],
  offered: readonly SpaceKind[]
): boolean {
  return offered.some((kind) => !selected.includes(kind));
}

export function regionLabel(
  regionId: number | null,
  regionNames: ReadonlyMap<number, string>
): string | null {
  if (regionId === null) return null;
  return regionNames.get(regionId) ?? `#${regionId}`;
}

export interface RegionOption {
  id: number;
  name: string;
}

/**
 * Only the regions these hauls actually touch at this end, so a picked region
 * can never land on an empty table. Origin and destination are listed
 * separately — "what leaves The Forge" and "what arrives in The Forge" are
 * different sets, and offering a region that only ever appears at the other
 * end would be a choice with no results behind it.
 */
export function regionOptionsFor(
  rows: readonly CourierRouteRow[],
  end: 'origin' | 'destination',
  regionNames: ReadonlyMap<number, string>
): RegionOption[] {
  const ids = new Set<number>();
  for (const row of rows) {
    const regionId = row[end].regionId;
    if (regionId !== null) ids.add(regionId);
  }
  return [...ids].map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }));
}

/**
 * What the shortcut knows about where the character is. `unknown` until it is
 * asked — deliberately, because asking is what may cost a request, and the
 * board must not spend one on a control the hauler may never touch.
 */
export type MyRegion =
  | { kind: 'unknown' }
  | { kind: 'region'; regionId: number }
  /** Asked, and there is no answer: no grant, offline, or a system the snapshot cannot place. */
  | { kind: 'unavailable' };

/**
 * One shared instance, for the same reason `PENDING` in `CourierResults` is one: this is the
 * default every render that has no answer yet hands the control, and a fresh
 * object would re-render it continuously.
 */
export const UNASKED: MyRegion = { kind: 'unknown' };
