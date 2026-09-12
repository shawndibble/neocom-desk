/**
 * The Courier half of the Contracts page's Search tab (issue #910): public
 * courier contracts as hauls to take, not items to buy.
 *
 * Its own component rather than a branch inside `ContractSearchPanel` because
 * the two modes share no filter and no column — a haul has no item, no
 * quantity and no price, and an offer has no route, reward or collateral. The
 * panel owns the snapshot, the mode and the region names; this owns
 * everything that is only true of a haul.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  FilterField,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SearchInput,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import {
  courierCollateral,
  filterCourierContracts,
  type CourierContractFilter,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

/** Rows shown before "show all" — the same cap the item results use. */
const ROW_CAP = 50;

/** `Select` has no null value, so "no region chosen" needs a sentinel option. */
const ALL_REGIONS = 'all';

/** The filter as the controls hold it: text fields stay strings until they are parsed into the engine's filter. */
interface CourierUiFilter {
  routeQuery: string;
  originRegionId: number | null;
  destinationRegionId: number | null;
  minReward: string;
  maxCollateral: string;
  maxVolume: string;
  minDays: string;
}

const EMPTY_UI_FILTER: CourierUiFilter = {
  routeQuery: '',
  originRegionId: null,
  destinationRegionId: null,
  minReward: '',
  maxCollateral: '',
  maxVolume: '',
  minDays: '',
};

/** A blank or unparseable field is "no restriction", never `NaN` — which would silently exclude every row. */
function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A location nothing local names still has to say *which* location it is —
 * the bare id, the same fallback the item results use for an unnamed type.
 */
function endpointName(endpoint: CourierEndpoint): string {
  return endpoint.name ?? `#${endpoint.locationId}`;
}

function regionLabel(
  regionId: number | null,
  regionNames: ReadonlyMap<number, string>
): string | null {
  if (regionId === null) return null;
  return regionNames.get(regionId) ?? `#${regionId}`;
}

interface RegionOption {
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
function regionOptionsFor(
  rows: readonly CourierRouteRow[],
  end: 'origin' | 'destination',
  regionNames: ReadonlyMap<number, string>
): RegionOption[] {
  const ids = new Set<number>();
  for (const row of rows) {
    const regionId = row[end].regionId;
    if (regionId !== null) ids.add(regionId);
  }
  return [...ids]
    .map((id) => ({ id, name: regionNames.get(id) ?? `#${id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface CourierFilterBarProps {
  filter: CourierUiFilter;
  onChange: (filter: CourierUiFilter) => void;
  originRegions: RegionOption[];
  destinationRegions: RegionOption[];
}

function CourierFilterBar({
  filter,
  onChange,
  originRegions,
  destinationRegions,
}: CourierFilterBarProps) {
  const { t } = useTranslation();
  // Counted off the controls, not off the parsed engine filter, for the same
  // reason the item bar does it: a half-typed "1e" parses to `null` there, and
  // the badge should say the field has been touched.
  const activeCount = [
    filter.routeQuery,
    filter.originRegionId !== null,
    filter.destinationRegionId !== null,
    filter.minReward,
    filter.maxCollateral,
    filter.maxVolume,
    filter.minDays,
  ].filter(Boolean).length;

  return (
    <FilterBar
      value={filter}
      onChange={onChange}
      activeCount={activeCount}
      // Six controls is the set `collapsible` exists for: laid out inline they
      // wrap to two rows above the table they exist to narrow. The item bar
      // beside this one carries four and stays open.
      collapsible
      className="border-b border-line px-3 py-2"
      search={
        <SearchInput
          value={filter.routeQuery}
          onChange={(event) => onChange({ ...filter, routeQuery: event.target.value })}
          placeholder={t('contractSearch.courierSearchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('contractSearch.originRegionLabel')}>
            <Select
              value={draft.originRegionId === null ? ALL_REGIONS : String(draft.originRegionId)}
              onValueChange={(value) =>
                setDraft({ ...draft, originRegionId: value === ALL_REGIONS ? null : Number(value) })
              }
            >
              <SelectTrigger aria-label={t('contractSearch.originRegionLabel')} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>{t('contractSearch.allRegions')}</SelectItem>
                {originRegions.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t('contractSearch.destinationRegionLabel')}>
            <Select
              value={
                draft.destinationRegionId === null ? ALL_REGIONS : String(draft.destinationRegionId)
              }
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  destinationRegionId: value === ALL_REGIONS ? null : Number(value),
                })
              }
            >
              <SelectTrigger
                aria-label={t('contractSearch.destinationRegionLabel')}
                className="w-44"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REGIONS}>{t('contractSearch.allRegions')}</SelectItem>
                {destinationRegions.map((region) => (
                  <SelectItem key={region.id} value={String(region.id)}>
                    {region.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label={t('contractSearch.minRewardLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.minRewardLabel')}
              placeholder={t('contractSearch.minRewardLabel')}
              className="w-32"
              value={draft.minReward}
              onChange={(event) => setDraft({ ...draft, minReward: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('contractSearch.maxCollateralLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.maxCollateralLabel')}
              placeholder={t('contractSearch.maxCollateralLabel')}
              className="w-32"
              value={draft.maxCollateral}
              onChange={(event) => setDraft({ ...draft, maxCollateral: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('contractSearch.maxVolumeLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.maxVolumeLabel')}
              placeholder={t('contractSearch.maxVolumeLabel')}
              className="w-32"
              value={draft.maxVolume}
              onChange={(event) => setDraft({ ...draft, maxVolume: event.target.value })}
            />
          </FilterField>
          <FilterField label={t('contractSearch.minDaysLabel')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('contractSearch.minDaysLabel')}
              placeholder={t('contractSearch.minDaysLabel')}
              className="w-24"
              value={draft.minDays}
              onChange={(event) => setDraft({ ...draft, minDays: event.target.value })}
            />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}

interface CourierResultsProps {
  rows: readonly CourierRouteRow[];
  regionNames: ReadonlyMap<number, string>;
}

/** Public courier contracts as hauls: route, reward, collateral, cargo, deadline. */
export function CourierResults({ rows, regionNames }: CourierResultsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [uiFilter, setUiFilter] = useState<CourierUiFilter>(EMPTY_UI_FILTER);
  const [showAll, setShowAll] = useState(false);

  const originRegions = useMemo(
    () => regionOptionsFor(rows, 'origin', regionNames),
    [rows, regionNames]
  );
  const destinationRegions = useMemo(
    () => regionOptionsFor(rows, 'destination', regionNames),
    [rows, regionNames]
  );

  const filter = useMemo<CourierContractFilter>(
    () => ({
      routeQuery: uiFilter.routeQuery,
      originRegionId: uiFilter.originRegionId,
      destinationRegionId: uiFilter.destinationRegionId,
      minReward: parseNumeric(uiFilter.minReward),
      maxCollateral: parseNumeric(uiFilter.maxCollateral),
      maxVolume: parseNumeric(uiFilter.maxVolume),
      minDaysToComplete: parseNumeric(uiFilter.minDays),
    }),
    [uiFilter]
  );

  /**
   * Best-paying first *before* the row cap, for the same reason the item
   * results sort cheapest-first before theirs: `DataTable` sorts only the rows
   * it is handed, so capping the snapshot's own contract-id order would leave
   * the table claiming a reward sort over an arbitrary 50.
   */
  const displayRows = useMemo(
    () => filterCourierContracts(rows, filter).sort((a, b) => b.reward - a.reward),
    [rows, filter]
  );

  function changeFilter(next: CourierUiFilter) {
    setUiFilter(next);
    setShowAll(false);
  }

  const columns = useMemo<DataTableColumn<CourierRouteRow>[]>(() => {
    const originRegion = (row: CourierRouteRow) => regionLabel(row.origin.regionId, regionNames);
    const destinationRegion = (row: CourierRouteRow) =>
      regionLabel(row.destination.regionId, regionNames);
    return [
      {
        id: 'route',
        header: t('contractSearch.routeColumn'),
        primary: true,
        sortValue: (row) => `${endpointName(row.origin)} ${endpointName(row.destination)}`,
        render: (row) => (
          <div className="flex flex-col gap-0.5">
            <span>
              {endpointName(row.origin)}
              {originRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem] text-text-dim">{originRegion(row)}</span>
              )}
            </span>
            <span className="text-text-dim">
              {'→ '}
              {endpointName(row.destination)}
              {destinationRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem]">{destinationRegion(row)}</span>
              )}
            </span>
          </div>
        ),
      },
      {
        id: 'reward',
        header: t('contractSearch.rewardColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.reward,
        render: (row) => formatIsk(row.reward, 2),
      },
      {
        id: 'collateral',
        header: t('contractSearch.collateralColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => courierCollateral(row),
        // A haul that asks for no collateral is a real, distinct offer — an em
        // dash says "none asked", where "0.00 ISK" reads as a figure the issuer
        // actually typed.
        render: (row) =>
          courierCollateral(row) === 0 ? '—' : formatIsk(courierCollateral(row), 2),
      },
      {
        id: 'volume',
        header: t('contractSearch.volumeColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.volume,
        render: (row) => `${row.volume.toLocaleString()} m³`,
      },
      {
        id: 'days',
        header: t('contractSearch.daysColumn'),
        align: 'right',
        className: 'tabular-nums',
        // A contract that states no deadline sorts last rather than as zero:
        // zero would rank it below the tightest real deadline in the list,
        // which is the opposite of what not stating one means.
        sortValue: (row) => row.daysToComplete ?? Number.POSITIVE_INFINITY,
        // The header already says Days; a bare figure keeps the column as
        // narrow as the number in it.
        render: (row) => (row.daysToComplete == null ? '—' : String(row.daysToComplete)),
      },
      {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
      },
    ];
  }, [t, regionNames, timeZone]);

  const visibleRows = showAll ? displayRows : displayRows.slice(0, ROW_CAP);

  return (
    <>
      <CourierFilterBar
        filter={uiFilter}
        onChange={changeFilter}
        originRegions={originRegions}
        destinationRegions={destinationRegions}
      />
      {displayRows.length === 0 ? (
        <EmptyState
          title={t('contractSearch.courierNoFilterMatches')}
          hint={t('contractSearch.courierNoFilterMatchesHint')}
          className="py-8"
        />
      ) : (
        <>
          <DataTable
            label={t('contractSearch.courierTitle')}
            columns={columns}
            rows={visibleRows}
            // One row per contract here — unlike the offers snapshot, where one
            // contract lists an item line per stack — so `contractId` alone is
            // a unique key.
            rowKey={(row) => String(row.contractId)}
            defaultSort={{ columnId: 'reward', direction: 'desc' }}
          />
          {!showAll && displayRows.length > ROW_CAP && (
            <div className="px-3 py-2">
              <Button size="sm" onClick={() => setShowAll(true)}>
                {t('contractSearch.showAll', { count: displayRows.length })}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
