import type { TFunction } from 'i18next';
import { boundText, summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { CourierRouteRow } from '@/engine/contracts/courierSearch';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import type { OverRateFilter } from '@/features/contractSearch/overRateFilter';
import { formatCount } from '@/lib/formatCount';
import { formatIskCompact, parseIskAmount } from '@/lib/isk';

export interface CourierUiFilter {
  routeQuery: string;
  originRegionId: number | null;
  destinationRegionId: number | null;
  destinationSpace: readonly SpaceKind[];
  hideUncompletable: boolean;
  overRate: OverRateFilter;
  minReward: string;
  maxCollateral: string;
  maxVolume: string;
  minDays: string;
}

export function offeredSpaceKinds(rows: readonly CourierRouteRow[]): SpaceKind[] {
  return SPACE_KINDS.filter((kind) => rows.some((row) => row.destination.space === kind));
}

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

export type MyRegion =
  { kind: 'unknown' } | { kind: 'region'; regionId: number } | { kind: 'unavailable' };

export const UNASKED: MyRegion = { kind: 'unknown' };

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
      inline: true,
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
