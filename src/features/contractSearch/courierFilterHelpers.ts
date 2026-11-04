/**
 * The Courier filter's types and pure helpers, split from `CourierFilterBar`
 * so that file exports only components.
 */
import type { TFunction } from 'i18next';
import { boundText, summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { CourierRouteRow } from '@/engine/contracts/courierSearch';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import type { OverRateFilter } from '@/features/contractSearch/overRateFilter';
import { formatCount } from '@/lib/formatCount';
import { formatIskCompact, parseIskAmount } from '@/lib/isk';

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

/**
 * The Courier filters set away from their default, as `FilterBar` pills, in
 * the order a hauler reads a lane: where it runs, then what it pays and asks.
 *
 * Read off the controls, not the parsed engine filter: a half-typed "1e"
 * parses to `null` there, and the pill should still say the field holds
 * something. The route search is left out — its box shows what it holds —
 * and so is the route preference, a remembered setting rather than a filter.
 */
export function activeCourierFilters(
  filter: CourierUiFilter,
  t: TFunction,
  {
    originRegions,
    destinationRegions,
    spaceKinds,
  }: {
    originRegions: readonly RegionOption[];
    destinationRegions: readonly RegionOption[];
    /** The bands on offer: every one of them selected is no restriction. */
    spaceKinds: readonly SpaceKind[];
  }
): ActiveFilter<CourierUiFilter>[] {
  const regionName = (options: readonly RegionOption[], regionId: number) =>
    options.find((option) => option.id === regionId)?.name ?? `#${regionId}`;
  const active: ActiveFilter<CourierUiFilter>[] = [];
  if (filter.originRegionId !== null)
    active.push({
      label: t('contractSearch.originRegionLabel'),
      value: regionName(originRegions, filter.originRegionId),
      clear: (value) => ({ ...value, originRegionId: null }),
    });
  if (filter.destinationRegionId !== null)
    active.push({
      label: t('contractSearch.destinationRegionLabel'),
      value: regionName(destinationRegions, filter.destinationRegionId),
      clear: (value) => ({ ...value, destinationRegionId: null }),
    });
  if (narrowsSpace(filter.destinationSpace, spaceKinds)) {
    const selected = spaceKinds.filter((kind) => filter.destinationSpace.includes(kind));
    active.push({
      label: t('contractSearch.destinationSpaceLabel'),
      value: summarizeFilterValues(
        selected.map((kind) => t(`common.spaceOption.${kind}`)),
        t
      ),
      clear: (value) => ({ ...value, destinationSpace: SPACE_KINDS }),
    });
  }
  if (filter.minReward.trim() !== '')
    active.push({
      label: t('contractSearch.minRewardLabel'),
      value: boundText(filter.minReward, formatIskCompact, parseIskAmount),
      clear: (value) => ({ ...value, minReward: '' }),
    });
  if (filter.maxCollateral.trim() !== '')
    active.push({
      label: t('contractSearch.maxCollateralLabel'),
      value: boundText(filter.maxCollateral, formatIskCompact, parseIskAmount),
      clear: (value) => ({ ...value, maxCollateral: '' }),
    });
  if (filter.maxVolume.trim() !== '')
    active.push({
      label: t('contractSearch.maxVolumeLabel'),
      value: boundText(filter.maxVolume, formatCount),
      clear: (value) => ({ ...value, maxVolume: '' }),
    });
  if (filter.minDays.trim() !== '')
    active.push({
      label: t('contractSearch.minDaysLabel'),
      value: boundText(filter.minDays, formatCount),
      clear: (value) => ({ ...value, minDays: '' }),
    });
  if (filter.overRate !== 'all')
    active.push({
      label: t('contractSearch.overRateLabel'),
      value: t(`contractSearch.overRate.${filter.overRate}`),
      clear: (value) => ({ ...value, overRate: 'all' }),
    });
  if (filter.hideUncompletable)
    active.push({
      label: t('contractSearch.hideUncompletableLabel'),
      clear: (value) => ({ ...value, hideUncompletable: false }),
    });
  return active;
}
