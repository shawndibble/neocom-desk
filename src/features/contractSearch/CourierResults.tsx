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
import { CourierContractDetailModal } from '@/features/contractSearch/CourierContractDetailModal';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';

/** Rows shown before "show all" — the same cap the item results use. */
const ROW_CAP = 50;

/** `Select` has no null value, so "no region chosen" needs a sentinel option. */
const ALL_REGIONS = 'all';

/**
 * One decimal, the same precision the industry tables give a hauling volume.
 * `toLocaleString` would give between none and three, which down a
 * `tabular-nums` column is a ragged edge where the point should line up.
 */
const VOLUME_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

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

/** The From/To pair: the same control twice, differing only in which end of the haul it reads. */
function RegionFilterField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number | null;
  options: RegionOption[];
  onChange: (regionId: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <FilterField label={label}>
      <Select
        value={value === null ? ALL_REGIONS : String(value)}
        onValueChange={(next) => onChange(next === ALL_REGIONS ? null : Number(next))}
      >
        <SelectTrigger aria-label={label} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_REGIONS}>{t('contractSearch.allRegions')}</SelectItem>
          {options.map((region) => (
            <SelectItem key={region.id} value={String(region.id)}>
              {region.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

/** A bare numeric bound — reward floor, collateral ceiling, cargo ceiling, deadline floor. */
function NumericFilterField({
  label,
  value,
  width,
  onChange,
}: {
  label: string;
  value: string;
  /** The field carries the width it needs *in the row*; the sheet stretches it regardless. */
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <FilterField label={label}>
      <TextInput
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={label}
        placeholder={label}
        className={width}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FilterField>
  );
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
          <RegionFilterField
            label={t('contractSearch.originRegionLabel')}
            value={draft.originRegionId}
            options={originRegions}
            onChange={(originRegionId) => setDraft({ ...draft, originRegionId })}
          />
          <RegionFilterField
            label={t('contractSearch.destinationRegionLabel')}
            value={draft.destinationRegionId}
            options={destinationRegions}
            onChange={(destinationRegionId) => setDraft({ ...draft, destinationRegionId })}
          />
          <NumericFilterField
            label={t('contractSearch.minRewardLabel')}
            value={draft.minReward}
            width="w-32"
            onChange={(minReward) => setDraft({ ...draft, minReward })}
          />
          <NumericFilterField
            label={t('contractSearch.maxCollateralLabel')}
            value={draft.maxCollateral}
            width="w-32"
            onChange={(maxCollateral) => setDraft({ ...draft, maxCollateral })}
          />
          <NumericFilterField
            label={t('contractSearch.maxVolumeLabel')}
            value={draft.maxVolume}
            width="w-32"
            onChange={(maxVolume) => setDraft({ ...draft, maxVolume })}
          />
          <NumericFilterField
            label={t('contractSearch.minDaysLabel')}
            value={draft.minDays}
            width="w-24"
            onChange={(minDays) => setDraft({ ...draft, minDays })}
          />
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
  const [selectedRow, setSelectedRow] = useState<CourierRouteRow | null>(null);

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
        render: (row) => `${VOLUME_FORMAT.format(row.volume)} m³`,
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
            onRowClick={setSelectedRow}
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
      {selectedRow && (
        <CourierContractDetailModal
          row={selectedRow}
          regionNames={regionNames}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </>
  );
}
