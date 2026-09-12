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
import { useEffect, useMemo, useState } from 'react';
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
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { localJumpCountsForRoutes } from '@/features/route/localRoute';
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
 * The route column names each end by its *system*, not its station: a haul is
 * read as Jita → Amarr, and the full "Jita IV - Moon 4 - Caldari Navy
 * Assembly Plant" costs two lines of table width to say the same thing. The
 * exact station is still one click away in the detail modal, which keeps it.
 *
 * Both fallbacks are reachable and mean different things. A station whose
 * system the snapshot did not resolve still has its own name, which is a
 * better answer than nothing; a location nothing local names at all — a
 * player structure — shows the bare id, the same fallback the item results
 * use for an unnamed type.
 */
function endpointSystemName(endpoint: CourierEndpoint): string {
  return endpoint.systemName ?? endpoint.name ?? `#${endpoint.locationId}`;
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

/**
 * Which trip the distances describe. A hauler who only flies highsec and one
 * who will cross a 0.4 system for a shorter run are asking different
 * questions of the same contract, and they get different jump counts — so
 * this is a control, not a constant.
 */
function RoutePreferenceField({
  value,
  onChange,
}: {
  value: RoutePreferenceKind;
  onChange: (preference: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  const label = t('contractSearch.routePreferenceLabel');
  return (
    <FilterField label={label}>
      <Select value={value} onValueChange={(next) => onChange(next as RoutePreferenceKind)}>
        <SelectTrigger aria-label={label} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUTE_PREFERENCES.map((preference) => (
            <SelectItem key={preference} value={preference}>
              {t(`contractSearch.routePreference.${preference}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

interface CourierFilterBarProps {
  filter: CourierUiFilter;
  onChange: (filter: CourierUiFilter) => void;
  originRegions: RegionOption[];
  destinationRegions: RegionOption[];
  preference: RoutePreferenceKind;
  onPreferenceChange: (preference: RoutePreferenceKind) => void;
}

function CourierFilterBar({
  filter,
  onChange,
  originRegions,
  destinationRegions,
  preference,
  onPreferenceChange,
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
          <RoutePreferenceField value={preference} onChange={onPreferenceChange} />
        </>
      )}
    </FilterBar>
  );
}

/**
 * The preferences offered, in the order a hauler weighs them. Deliberately
 * component state rather than a saved setting: a second *persisted* route
 * preference is what would force unifying this vocabulary with the Assets
 * page's own `RoutePreference` and ESI's flag names, and that unification is
 * recorded as work to do before such a control ships, not as part of this one.
 */
const ROUTE_PREFERENCES: readonly RoutePreferenceKind[] = [
  'prefer-highsec',
  'shortest',
  'avoid-highsec',
];

/**
 * Highsec-preferring by default: it is the trip most haulers will actually
 * fly, and a rate quoted against a route nobody would take is the wrong
 * number to rank on.
 */
const DEFAULT_ROUTE_PREFERENCE: RoutePreferenceKind = 'prefer-highsec';

/**
 * Jumps for every filtered row, recomputed when the rows or the preference
 * change.
 *
 * Async because the graph is a snapshot read, which is why this is state and
 * not a `useMemo` — and why `pending` is its own outcome. A board mid-load
 * must not read as "no route exists", which is what an empty result would say.
 *
 * Resolved in one batched pass (`localJumpCountsForRoutes`) rather than per
 * row: the pass groups by origin and sweeps where an origin repeats, so cost
 * tracks distinct origins instead of row count.
 */
type JumpsState =
  { kind: 'pending' } | { kind: 'known'; counts: readonly (number | null)[] } | { kind: 'unknown' };

function useJumpCounts(
  rows: readonly CourierRouteRow[],
  preference: RoutePreferenceKind
): JumpsState {
  // The answer carries the inputs it was computed for, so "pending" is
  // *derived* during render rather than written by the effect: an answer whose
  // inputs are no longer the current ones is stale by definition, and the
  // board reads as loading the instant they change, with no extra render.
  const [answer, setAnswer] = useState<{
    rows: readonly CourierRouteRow[];
    preference: RoutePreferenceKind;
    state: JumpsState;
  } | null>(null);

  useEffect(() => {
    let current = true;
    void localJumpCountsForRoutes(
      rows.map((row) => ({
        originSystemId: row.origin.systemId,
        destinationSystemId: row.destination.systemId,
      })),
      preference
    ).then((state) => {
      // A later preference or filter has already superseded this answer.
      if (current) setAnswer({ rows, preference, state });
    });
    return () => {
      current = false;
    };
  }, [rows, preference]);

  return answer && answer.rows === rows && answer.preference === preference
    ? answer.state
    : { kind: 'pending' };
}

/**
 * ISK per jump — the rate a hauler ranks on, since the cost of a haul is the
 * trip and the trip is jumps.
 *
 * A same-system haul is zero jumps and a real job, so it divides by one trip
 * rather than by zero: the whole reward is earned without leaving the system,
 * which is the best rate on the board and should read that way.
 */
function iskPerJump(reward: number, jumps: number | null): number | null {
  if (jumps === null) return null;
  return reward / Math.max(jumps, 1);
}

interface CourierResultsProps {
  rows: readonly CourierRouteRow[];
  regionNames: ReadonlyMap<number, string>;
}

/** Public courier contracts as hauls: route, distance, pay rate, cargo and risk. */
export function CourierResults({ rows, regionNames }: CourierResultsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [uiFilter, setUiFilter] = useState<CourierUiFilter>(EMPTY_UI_FILTER);
  const [preference, setPreference] = useState<RoutePreferenceKind>(DEFAULT_ROUTE_PREFERENCE);
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

  const matchingRows = useMemo(() => filterCourierContracts(rows, filter), [rows, filter]);
  const jumps = useJumpCounts(matchingRows, preference);

  /**
   * Best rate first *before* the row cap: `DataTable` sorts only the rows it
   * is handed, so capping an unranked set would leave the table claiming an
   * ISK/jump sort over an arbitrary 50.
   *
   * Changing the preference changes every jump count and therefore this
   * order, which is why the whole filtered set is ranked here rather than the
   * visible page. Until the counts arrive the rate is unknown for every row,
   * so the fallback order is by reward — the board stays useful mid-load
   * instead of shuffling from an order that means nothing.
   */
  const displayRows = useMemo(() => {
    const ranked = [...matchingRows];
    if (jumps.kind !== 'known') return ranked.sort((a, b) => b.reward - a.reward);
    const rateByContract = new Map<number, number | null>();
    matchingRows.forEach((row, index) => {
      rateByContract.set(row.contractId, iskPerJump(row.reward, jumps.counts[index] ?? null));
    });
    // A haul with no measurable distance has no rate, and sorts last rather
    // than as zero — "we cannot say" is not "pays nothing".
    return ranked.sort(
      (a, b) => (rateByContract.get(b.contractId) ?? -1) - (rateByContract.get(a.contractId) ?? -1)
    );
  }, [matchingRows, jumps]);

  /** Jumps are resolved against the filtered set, so a row's count is found by its own id. */
  const jumpsByContract = useMemo(() => {
    const byContract = new Map<number, number | null>();
    if (jumps.kind !== 'known') return byContract;
    matchingRows.forEach((row, index) => {
      byContract.set(row.contractId, jumps.counts[index] ?? null);
    });
    return byContract;
  }, [matchingRows, jumps]);

  function changeFilter(next: CourierUiFilter) {
    setUiFilter(next);
    setShowAll(false);
  }

  function changePreference(next: RoutePreferenceKind) {
    setPreference(next);
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
        sortValue: (row) =>
          `${endpointSystemName(row.origin)} ${endpointSystemName(row.destination)}`,
        render: (row) => (
          <div className="flex flex-col gap-0.5">
            <span>
              {endpointSystemName(row.origin)}
              {originRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem] text-text-dim">{originRegion(row)}</span>
              )}
            </span>
            <span className="text-text-dim">
              {'→ '}
              {endpointSystemName(row.destination)}
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
        id: 'jumps',
        header: t('contractSearch.jumpsColumn'),
        align: 'right',
        className: 'tabular-nums',
        // No distance sorts last rather than as zero: zero would rank an
        // unmeasurable haul above every real one under the default sort.
        sortValue: (row) => jumpsByContract.get(row.contractId) ?? Number.POSITIVE_INFINITY,
        render: (row) => {
          if (jumps.kind === 'pending') return <span className="text-text-dim">…</span>;
          const count = jumpsByContract.get(row.contractId) ?? null;
          if (count === null) {
            return (
              <span className="text-text-dim" title={t('contractSearch.jumpsUnavailableHint')}>
                —
              </span>
            );
          }
          return String(count);
        },
      },
      {
        id: 'iskPerJump',
        header: t('contractSearch.iskPerJumpColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) =>
          iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null) ?? -1,
        render: (row) => {
          if (jumps.kind === 'pending') return <span className="text-text-dim">…</span>;
          const rate = iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null);
          return rate === null ? <span className="text-text-dim">—</span> : formatIsk(rate, 0);
        },
      },
      {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (row) => row.dateExpired,
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
      },
    ];
  }, [t, regionNames, timeZone, jumps.kind, jumpsByContract]);

  const visibleRows = showAll ? displayRows : displayRows.slice(0, ROW_CAP);

  return (
    <>
      <CourierFilterBar
        filter={uiFilter}
        onChange={changeFilter}
        originRegions={originRegions}
        destinationRegions={destinationRegions}
        preference={preference}
        onPreferenceChange={changePreference}
      />
      {displayRows.length === 0 ? (
        <EmptyState
          title={t('contractSearch.courierNoFilterMatches')}
          hint={t('contractSearch.courierNoFilterMatchesHint')}
          className="py-8"
        />
      ) : (
        <>
          {jumps.kind === 'unknown' && (
            <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
              {t('contractSearch.jumpsSnapshotUnavailable')}
            </p>
          )}
          <DataTable
            label={t('contractSearch.courierTitle')}
            columns={columns}
            rows={visibleRows}
            // One row per contract here — unlike the offers snapshot, where one
            // contract lists an item line per stack — so `contractId` alone is
            // a unique key.
            rowKey={(row) => String(row.contractId)}
            defaultSort={{ columnId: 'iskPerJump', direction: 'desc' }}
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
