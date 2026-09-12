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
  FilterChip,
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
import { iskPerJump, iskPerVolume } from '@/engine/contracts/courierRates';
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { localJumpCountsForRoutes } from '@/features/route/localRoute';
import { CourierContractDetailModal } from '@/features/contractSearch/CourierContractDetailModal';
import { formatIsk, formatIskAuto } from '@/lib/isk';
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
  /** Which bands the hauler will deliver into; every offered band is "no restriction". */
  destinationSpace: readonly SpaceKind[];
  minReward: string;
  maxCollateral: string;
  maxVolume: string;
  minDays: string;
}

const EMPTY_UI_FILTER: CourierUiFilter = {
  routeQuery: '',
  originRegionId: null,
  destinationRegionId: null,
  destinationSpace: SPACE_KINDS,
  minReward: '',
  maxCollateral: '',
  maxVolume: '',
  minDays: '',
};

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
function offeredSpaceKinds(rows: readonly CourierRouteRow[]): SpaceKind[] {
  return SPACE_KINDS.filter((kind) => rows.some((row) => row.destination.space === kind));
}

/**
 * Whether the hauler has actually narrowed anything. Measured against the bands
 * on offer, not all four: with every offered band selected this must be no
 * filter at all, so a destination that has no band stays visible.
 */
function narrowsSpace(selected: readonly SpaceKind[], offered: readonly SpaceKind[]): boolean {
  return offered.some((kind) => !selected.includes(kind));
}

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

/**
 * Where this end sits, in the same four bands BPC Search's Space filter uses.
 *
 * Endpoint security, never route security: a highsec pickup and a highsec
 * delivery can still route through lowsec, and this app cannot know — a
 * per-row route lookup is the ESI fan-out all three courier scope decisions
 * refuse. So the band describes the end it sits beside and claims nothing
 * about the trip between them.
 */
function EndpointSpace({ space }: { space: SpaceKind | null }) {
  const { t } = useTranslation();
  return (
    <span className="ml-1.5 text-[0.6875rem] text-text-dim">
      {space === null ? t('contractSearch.spaceUnknown') : t(`common.spaceOption.${space}`)}
    </span>
  );
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
  spaceKinds: readonly SpaceKind[];
  preference: RoutePreferenceKind;
  onPreferenceChange: (preference: RoutePreferenceKind) => void;
}

function CourierFilterBar({
  filter,
  onChange,
  originRegions,
  destinationRegions,
  spaceKinds,
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
    narrowsSpace(filter.destinationSpace, spaceKinds),
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
      // Well past the set `collapsible` exists for: laid out inline these wrap
      // to two rows above the table they exist to narrow. The item bar beside
      // this one carries four and stays open.
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
          {/*
            Named for the endpoint, not the route: this says where a haul ends,
            and there is deliberately no "avoid lowsec" control beside it — that
            would be a safety claim about the whole trip made from data that
            only describes its two ends.

            Hidden entirely when no band is on offer, rather than shown as a
            label with nothing under it: that is the state while the endpoints
            are still being placed, and the permanent state if the local station
            snapshot cannot be read at all.
          */}
          {spaceKinds.length > 0 && (
            <div
              role="group"
              aria-label={t('contractSearch.destinationSpaceLabel')}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-text-dim">{t('contractSearch.destinationSpaceLabel')}</span>
              {spaceKinds.map((kind) => (
                <FilterChip
                  key={kind}
                  label={t(`common.spaceOption.${kind}`)}
                  selected={draft.destinationSpace.includes(kind)}
                  onToggle={() =>
                    setDraft({
                      ...draft,
                      destinationSpace: draft.destinationSpace.includes(kind)
                        ? draft.destinationSpace.filter((existing) => existing !== kind)
                        : [...draft.destinationSpace, kind],
                    })
                  }
                />
              ))}
            </div>
          )}
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

/**
 * One shared instance. A fresh object here would change identity on every
 * render, and this value is a dependency of the row ranking, the jump lookup
 * and the column set — so all three would recompute continuously for exactly
 * as long as the board is loading, which is when the filtered set is largest.
 */
const PENDING: JumpsState = { kind: 'pending' };

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
    let cancelled = false;
    void localJumpCountsForRoutes(
      rows.map((row) => ({
        originSystemId: row.origin.systemId,
        destinationSystemId: row.destination.systemId,
      })),
      preference
    ).then((state) => {
      if (!cancelled) setAnswer({ rows, preference, state });
    });
    return () => {
      cancelled = true;
    };
  }, [rows, preference]);

  return answer && answer.rows === rows && answer.preference === preference
    ? answer.state
    : PENDING;
}

interface CourierResultsProps {
  rows: readonly CourierRouteRow[];
  regionNames: ReadonlyMap<number, string>;
}

/**
 * Public courier contracts as hauls: route, distance, pay rates and risk.
 *
 * Two rates, and the order matters. ISK/jump ranks the board, because a
 * hauler's cost is the trip; ISK/m³ sits beside it for the narrower question
 * of filling one hold from several contracts along a lane, where space rather
 * than distance is scarce.
 *
 * Volume and deadline are filters and detail-modal figures rather than
 * columns — both are constraints a hauler settles once (does this fit my
 * hull, am I given long enough) rather than figures worth ranking fifty rows
 * by, and the table's width is owed to the ones that are.
 */
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
  const spaceKinds = useMemo(() => offeredSpaceKinds(rows), [rows]);

  const filter = useMemo<CourierContractFilter>(
    () => ({
      routeQuery: uiFilter.routeQuery,
      originRegionId: uiFilter.originRegionId,
      destinationRegionId: uiFilter.destinationRegionId,
      // Every offered band selected is not a filter at all — a haul whose
      // destination nothing local places has no band, and must not be excluded
      // by a control the hauler never narrowed. Same reading as BPC Search's
      // own Space filter.
      destinationSpace: narrowsSpace(uiFilter.destinationSpace, spaceKinds)
        ? uiFilter.destinationSpace
        : null,
      minReward: parseNumeric(uiFilter.minReward),
      maxCollateral: parseNumeric(uiFilter.maxCollateral),
      maxVolume: parseNumeric(uiFilter.maxVolume),
      minDaysToComplete: parseNumeric(uiFilter.minDays),
    }),
    [uiFilter, spaceKinds]
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
              <EndpointSpace space={row.origin.space} />
            </span>
            <span className="text-text-dim">
              {'→ '}
              {endpointSystemName(row.destination)}
              {destinationRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem]">{destinationRegion(row)}</span>
              )}
              <EndpointSpace space={row.destination.space} />
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
        id: 'jumps',
        header: t('contractSearch.jumpsColumn'),
        align: 'right',
        className: 'tabular-nums',
        // `undefined`, never a stand-in figure: `DataTable` sinks a valueless
        // row to the end in *either* direction, where a large or small
        // sentinel would lead the table on one of them.
        sortValue: (row) => jumpsByContract.get(row.contractId) ?? undefined,
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
        /** Same rule as Jumps above: no rate sinks the row, in either direction. */
        sortValue: (row) =>
          iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null) ?? undefined,
        render: (row) => {
          if (jumps.kind === 'pending') return <span className="text-text-dim">…</span>;
          const rate = iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null);
          return rate === null ? <span className="text-text-dim">—</span> : formatIskAuto(rate);
        },
      },
      {
        id: 'iskPerVolume',
        header: t('contractSearch.iskPerVolumeColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => iskPerVolume(row.reward, row.volume) ?? undefined,
        // `formatIskAuto`, not whole ISK: this rate spans orders of magnitude
        // the ISK/jump column never sees, and whole-ISK formatting clamps
        // anything under half an ISK to "0" — which would print a low-paying
        // bulk haul exactly like the deliberate zero of a favour run.
        render: (row) => {
          const rate = iskPerVolume(row.reward, row.volume);
          return rate === null ? <span className="text-text-dim">—</span> : formatIskAuto(rate);
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

  /**
   * A narrowed space filter drops every haul whose destination nothing local
   * places, because "unknown" is not a band. To a player that reads as the
   * filter eating rows, so when it is the reason the table is empty, the empty
   * state says so rather than repeating the generic "nothing matched" — the
   * board must not present an exclusion it made as an absence in the data.
   *
   * "The reason" is the whole point, so this asks the actual question: with the
   * band filter lifted and every *other* filter still applied, would an
   * unplaced destination be on screen? Testing the unfiltered rows instead
   * would blame the band filter for an empty table a minimum reward or a region
   * had emptied, which is the opposite of saying which cause applies.
   */
  const excludedUnplacedDestinations = useMemo(() => {
    if (matchingRows.length > 0 || !narrowsSpace(uiFilter.destinationSpace, spaceKinds)) {
      return false;
    }
    return filterCourierContracts(rows, { ...filter, destinationSpace: null }).some(
      (row) => row.destination.space === null
    );
    // `matchingRows`, not `displayRows`: the two always have the same length,
    // and keying on the ranked copy would re-run this every time the jump
    // counts land and reorder it.
  }, [matchingRows, rows, filter, uiFilter.destinationSpace, spaceKinds]);

  return (
    <>
      <CourierFilterBar
        filter={uiFilter}
        onChange={changeFilter}
        originRegions={originRegions}
        destinationRegions={destinationRegions}
        spaceKinds={spaceKinds}
        preference={preference}
        onPreferenceChange={changePreference}
      />
      {displayRows.length === 0 ? (
        <EmptyState
          title={t('contractSearch.courierNoFilterMatches')}
          hint={t(
            excludedUnplacedDestinations
              ? 'contractSearch.courierNoFilterMatchesUnplacedHint'
              : 'contractSearch.courierNoFilterMatchesHint'
          )}
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
