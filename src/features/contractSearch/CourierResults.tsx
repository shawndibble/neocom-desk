import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { CourierFilterBar } from '@/features/contractSearch/CourierFilterBar';
import {
  UNASKED,
  narrowsSpace,
  offeredSpaceKinds,
  regionLabel,
  regionOptionsFor,
  type CourierUiFilter,
  type MyRegion,
} from '@/features/contractSearch/courierFilterHelpers';
import { JumpsLink } from '@/features/route/JumpsLink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  IskAmount,
  type DataTableColumn,
  type DataTableGroupBy,
} from '@/components/ui';
import { COL_DATETIME_STACKED, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import {
  COURIER_COLUMN_IDS,
  useVisibleCourierColumns,
  type CourierColumnId,
} from '@/features/contractSearch/courierColumns';
import {
  courierCollateral,
  filterCourierContracts,
  type CourierContractFilter,
  type CourierEndpoint,
  type CourierRouteRow,
} from '@/engine/contracts/courierSearch';
import { iskPerJump, iskPerVolume, rewardPerVolumeJump } from '@/engine/contracts/courierRates';
import {
  corpusGoingRate,
  goingRateMultiple,
  paysFarAboveGoingRate,
} from '@/engine/contracts/courierGoingRate';
import { SPACE_KINDS } from '@/engine/space';
import { OVER_RATE_FILTERS } from '@/features/contractSearch/overRateFilter';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  completableCourierRoutes,
  endpointRisks,
  type CourierRiskKind,
} from '@/engine/contracts/courierRisk';
import { EndpointRiskMarkers, RiskMarker } from '@/features/contractSearch/courierRiskDisplay';
import { MARKED_RISKS } from '@/features/contractSearch/courierRiskLabels';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { localJumpCountsForRoutes } from '@/features/route/localRoute';
import { useJumpBasis, type JumpBasis } from '@/features/route/jumpBasis';
import {
  CourierContractDetailModal,
  type CourierJumps,
  type ReverseLane,
} from '@/features/contractSearch/CourierContractDetailModal';
import { reverseLaneMatches } from '@/engine/contracts/courierReverseLane';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { courierContractsCsvColumns } from './courierContractsCsv';
import { endpointSystemName } from '@/features/contractSearch/courierEndpointNames';
import { loadCharacterRegionId } from '@/features/contractSearch/characterRegion';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { formatIskAuto, formatIskCompact, parseNumeric } from '@/lib/isk';
import { formatMagnitude } from '@/lib/magnitude';
import { splitTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useRememberedUrlParams, useUrlSort, type UrlParamValues } from '@/lib/useUrlState';
import {
  boolParam,
  enumParam,
  enumSetParam,
  optionalEnumParam,
  optionalIdParam,
  textParam,
} from '@/lib/urlState';
import {
  DEFAULT_COURIER_FILTER,
  useCourierFilterPref,
  type StoredCourierFilter,
} from '@/features/contractSearch/courierFilterPref';
import { useHydratedStore } from '@/lib/useHydratedStore';

function EndpointSecurity({ security }: { security: number | null }) {
  if (security === null) return null;
  return <SecurityStatus security={security} className="ml-1" />;
}

function laneKey(row: CourierRouteRow): string | null {
  if (row.origin.systemId === null || row.destination.systemId === null) return null;
  return `${row.origin.systemId}>${row.destination.systemId}`;
}

function laneCount(rows: readonly CourierRouteRow[]): number {
  const keys = new Set<string>();
  let ungrouped = 0;
  for (const row of rows) {
    const key = laneKey(row);
    if (key === null) ungrouped += 1;
    else keys.add(key);
  }
  return keys.size + ungrouped;
}

const COURIER_FILTER_PARAMS = {
  'courier.q': textParam(),
  'courier.origin': optionalIdParam(),
  'courier.dest': optionalIdParam(),
  'courier.space': enumSetParam(SPACE_KINDS),
  'courier.hideRisky': boolParam(),
  'courier.overRate': enumParam(OVER_RATE_FILTERS, 'all'),
  'courier.minReward': textParam(),
  'courier.maxCollateral': textParam(),
  'courier.maxVolume': textParam(),
  'courier.minDays': textParam(),
  'courier.pref': optionalEnumParam(ROUTE_PREFERENCES),
};
const COURIER_SORT = { columnId: 'iskPerJump', direction: 'desc' } as const;

type CourierFilterParams = UrlParamValues<typeof COURIER_FILTER_PARAMS>;

function rememberedParams(stored: StoredCourierFilter): Partial<CourierFilterParams> {
  return {
    'courier.origin': stored.originRegionId,
    'courier.dest': stored.destinationRegionId,
    'courier.space': new Set(stored.destinationSpace),
    'courier.hideRisky': stored.hideUncompletable,
    'courier.overRate': stored.overRate,
    'courier.minReward': stored.minReward,
    'courier.maxCollateral': stored.maxCollateral,
    'courier.maxVolume': stored.maxVolume,
    'courier.minDays': stored.minDays,
  };
}

function storedPatch(patch: Partial<CourierFilterParams>): Partial<StoredCourierFilter> {
  const result: Partial<StoredCourierFilter> = {};
  if ('courier.origin' in patch) result.originRegionId = patch['courier.origin'];
  if ('courier.dest' in patch) result.destinationRegionId = patch['courier.dest'];
  if (patch['courier.space'] !== undefined) result.destinationSpace = [...patch['courier.space']];
  if (patch['courier.hideRisky'] !== undefined)
    result.hideUncompletable = patch['courier.hideRisky'];
  if (patch['courier.overRate'] !== undefined) result.overRate = patch['courier.overRate'];
  if (patch['courier.minReward'] !== undefined) result.minReward = patch['courier.minReward'];
  if (patch['courier.maxCollateral'] !== undefined)
    result.maxCollateral = patch['courier.maxCollateral'];
  if (patch['courier.maxVolume'] !== undefined) result.maxVolume = patch['courier.maxVolume'];
  if (patch['courier.minDays'] !== undefined) result.minDays = patch['courier.minDays'];
  return result;
}

type JumpsState =
  { kind: 'pending' } | { kind: 'known'; counts: readonly (number | null)[] } | { kind: 'unknown' };

const PENDING: JumpsState = { kind: 'pending' };

const PENDING_JUMPS: CourierJumps = { kind: 'pending' };

function useJumpCounts(rows: readonly CourierRouteRow[], route: JumpBasis): JumpsState {
  const [answer, setAnswer] = useState<{
    rows: readonly CourierRouteRow[];
    routeKey: string;
    state: JumpsState;
  } | null>(null);
  const { rules, network, key: routeKey, hydrated } = route;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void localJumpCountsForRoutes(
      rows.map((row) => ({
        originSystemId: row.origin.systemId,
        destinationSystemId: row.destination.systemId,
      })),
      rules,
      network
    ).then((state) => {
      if (!cancelled) setAnswer({ rows, routeKey, state });
    });
    return () => {
      cancelled = true;
    };
  }, [rows, rules, network, routeKey, hydrated]);

  return answer && answer.rows === rows && answer.routeKey === routeKey ? answer.state : PENDING;
}

function EndpointSystem({ endpoint }: { endpoint: CourierRouteRow['origin'] }) {
  const name = endpointSystemName(endpoint);
  return <span className={entityLinkClassName()}>{name}</span>;
}

function LaneGroupHeader({
  rows,
  regionNames,
  pending,
  rateFor,
  multipleFor,
}: {
  rows: readonly CourierRouteRow[];
  regionNames: ReadonlyMap<number, string>;
  pending: boolean;
  rateFor: (row: CourierRouteRow) => number | null;
  multipleFor: (row: CourierRouteRow) => number | null;
}) {
  const { t } = useTranslation();
  const first = rows[0];
  if (!first) return null;

  const rates = rows.map(rateFor).filter((rate): rate is number => rate !== null);
  const best = rates.length > 0 ? Math.max(...rates) : null;

  const multiples = rows.map(multipleFor).filter((multiple): multiple is number => {
    return multiple !== null && paysFarAboveGoingRate(multiple);
  });
  const present = new Set<CourierRiskKind>();
  for (const row of rows) {
    for (const kind of endpointRisks(row.origin, 'origin')) present.add(kind);
    for (const kind of endpointRisks(row.destination, 'destination')) present.add(kind);
  }
  if (multiples.length > 0) present.add('over-rate');
  const marked = MARKED_RISKS.filter((kind) => present.has(kind));

  const originRegion = regionLabel(first.origin.regionId, regionNames);
  const destinationRegion = regionLabel(first.destination.regionId, regionNames);

  return (
    <span className="flex items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">
          {endpointSystemName(first.origin)}
          <EndpointSecurity security={first.origin.security} />
          {' → '}
          {endpointSystemName(first.destination)}
          <EndpointSecurity security={first.destination.security} />
        </span>
        <span className="text-[0.6875rem] text-text-dim">
          {t('contractSearch.courierMobile.laneHauls', { count: rows.length })}
          {originRegion &&
            destinationRegion &&
            ` · ${t('contractSearch.courierMobile.laneRegions', {
              origin: originRegion,
              destination: destinationRegion,
            })}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
        <span className="whitespace-nowrap tabular-nums">
          <span className="font-bold">
            {pending ? '…' : best === null ? '—' : formatIskCompact(best)}
          </span>
          <span className="text-[0.6875rem] text-text-dim">
            {t('contractSearch.courierMobile.bestIskPerJump')}
          </span>
        </span>
        {marked.length > 0 && (
          <span className="flex flex-wrap justify-end gap-1">
            {marked.map((kind) => (
              <RiskMarker
                key={kind}
                kind={kind}
                plain
                detailOptions={
                  kind === 'over-rate'
                    ? { multiple: formatMagnitude(Math.max(...multiples)) }
                    : undefined
                }
              />
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

interface CourierResultsProps {
  rows: readonly CourierRouteRow[];
  regionNames: ReadonlyMap<number, string>;
  characterId: number;
  onStructurePlaced?: (endpoint: CourierEndpoint) => void;
}

export function CourierResults({
  rows,
  regionNames,
  characterId,
  onStructurePlaced,
}: CourierResultsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const rememberedFilter = useCourierFilterPref((state) => state.value);
  useHydratedStore(useCourierFilterPref);
  const remembered = useMemo(
    () => ({
      values: rememberedParams(rememberedFilter),
      remember: (patch: Partial<CourierFilterParams>) => {
        const { value, setValue } = useCourierFilterPref.getState();
        void setValue({ ...value, ...storedPatch(patch) });
      },
    }),
    [rememberedFilter]
  );
  const [params, setParams] = useRememberedUrlParams(COURIER_FILTER_PARAMS, remembered);

  const uiFilter = useMemo<CourierUiFilter>(
    () => ({
      routeQuery: params['courier.q'],
      originRegionId: params['courier.origin'],
      destinationRegionId: params['courier.dest'],
      destinationSpace: [...params['courier.space']],
      hideUncompletable: params['courier.hideRisky'],
      overRate: params['courier.overRate'],
      minReward: params['courier.minReward'],
      maxCollateral: params['courier.maxCollateral'],
      maxVolume: params['courier.maxVolume'],
      minDays: params['courier.minDays'],
    }),
    [params]
  );
  const preferenceOverride = params['courier.pref'];
  const routeQuery = useJumpBasis(preferenceOverride);
  const preference = routeQuery.rules.preference;
  const [clickedRow, setClickedRow] = useState<CourierRouteRow | null>(null);
  const selectedRow = useMemo(
    () =>
      clickedRow === null
        ? null
        : (rows.find((row) => row.contractId === clickedRow.contractId) ?? clickedRow),
    [clickedRow, rows]
  );

  const [myRegionAnswer, setMyRegionAnswer] = useState<{
    characterId: number;
    state: MyRegion;
  } | null>(null);
  const [myRegionPendingFor, setMyRegionPendingFor] = useState<number | null>(null);
  const myRegion =
    myRegionAnswer && myRegionAnswer.characterId === characterId ? myRegionAnswer.state : UNASKED;
  const myRegionPending = myRegionPendingFor === characterId;

  const resolveMyRegion = useCallback(async (): Promise<MyRegion> => {
    setMyRegionPendingFor(characterId);
    let next: MyRegion;
    try {
      const regionId = await loadCharacterRegionId(characterId);
      next = regionId === null ? { kind: 'unavailable' } : { kind: 'region', regionId };
    } catch {
      next = { kind: 'unavailable' };
    }
    setMyRegionAnswer({ characterId, state: next });
    setMyRegionPendingFor((pendingFor) => (pendingFor === characterId ? null : pendingFor));
    return next;
  }, [characterId]);

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

  const narrowToCompletable = useCallback(
    (candidates: readonly CourierRouteRow[]) =>
      uiFilter.hideUncompletable ? completableCourierRoutes(candidates) : [...candidates],
    [uiFilter.hideUncompletable]
  );

  const matchingRows = useMemo(
    () => narrowToCompletable(filterCourierContracts(rows, filter)),
    [rows, filter, narrowToCompletable]
  );
  const jumps = useJumpCounts(rows, routeQuery);
  const visibleColumns = useVisibleCourierColumns((state) => state.value);
  const setVisibleColumns = useVisibleCourierColumns((state) => state.setValue);
  useHydratedStore(useVisibleCourierColumns);
  function toggleColumn(id: CourierColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    void setVisibleColumns(next);
  }

  const jumpsByContract = useMemo(() => {
    const byContract = new Map<number, number | null>();
    if (jumps.kind !== 'known') return byContract;
    rows.forEach((row, index) => {
      byContract.set(row.contractId, jumps.counts[index] ?? null);
    });
    return byContract;
  }, [rows, jumps]);

  const goingRate = useMemo(
    () =>
      corpusGoingRate(
        rows.map((row) =>
          rewardPerVolumeJump(row.reward, row.volume, jumpsByContract.get(row.contractId) ?? null)
        )
      ),
    [rows, jumpsByContract]
  );

  const multipleFor = useCallback(
    (row: CourierRouteRow) =>
      goingRateMultiple(
        rewardPerVolumeJump(row.reward, row.volume, jumpsByContract.get(row.contractId) ?? null),
        goingRate
      ),
    [jumpsByContract, goingRate]
  );

  const narrowToOverRate = useCallback(
    (candidates: readonly CourierRouteRow[]) => {
      if (uiFilter.overRate === 'all' || jumps.kind !== 'known') return [...candidates];
      const wantFlagged = uiFilter.overRate === 'only';
      return candidates.filter((row) => {
        const multiple = multipleFor(row);
        if (multiple === null) return !wantFlagged;
        return paysFarAboveGoingRate(multiple) === wantFlagged;
      });
    },
    [uiFilter.overRate, multipleFor, jumps.kind]
  );

  const ratedRows = useMemo(() => narrowToOverRate(matchingRows), [matchingRows, narrowToOverRate]);

  const displayRows = useMemo(() => {
    const ranked = [...ratedRows];
    if (jumps.kind !== 'known') return ranked.sort((a, b) => b.reward - a.reward);
    const rate = (row: CourierRouteRow) =>
      iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null) ?? -1;
    return ranked.sort((a, b) => rate(b) - rate(a));
  }, [ratedRows, jumps, jumpsByContract]);

  const reverseLane = useMemo<ReverseLane | null>(() => {
    if (selectedRow === null) return null;
    const lane = reverseLaneMatches(selectedRow, rows, filter);
    if (lane === null) return { kind: 'unresolved' };
    return {
      kind: 'counted',
      count: narrowToOverRate(narrowToCompletable(lane.matches)).length,
      unplaceable: narrowToCompletable(lane.unplaceable).length,
    };
  }, [selectedRow, rows, filter, narrowToCompletable, narrowToOverRate]);

  function changeFilter(next: CourierUiFilter) {
    setParams({
      'courier.q': next.routeQuery,
      'courier.origin': next.originRegionId,
      'courier.dest': next.destinationRegionId,
      'courier.space': new Set(next.destinationSpace),
      'courier.hideRisky': next.hideUncompletable,
      'courier.overRate': next.overRate,
      'courier.minReward': next.minReward,
      'courier.maxCollateral': next.maxCollateral,
      'courier.maxVolume': next.maxVolume,
      'courier.minDays': next.minDays,
    });
  }

  const focusAfterCommit = useFocusAfterCommit();
  const resultsRef = useRef<HTMLDivElement>(null);

  function searchReverseLane(row: CourierRouteRow) {
    setClickedRow(null);
    focusAfterCommit(resultsRef);
    changeFilter({
      ...uiFilter,
      originRegionId: row.destination.regionId,
      destinationRegionId: row.origin.regionId,
    });
  }

  function changePreference(next: RoutePreferenceKind) {
    setParams({ 'courier.pref': next });
  }

  const courierColumnsById = useMemo<Record<CourierColumnId, DataTableColumn<CourierRouteRow>>>(
    () => ({
      reward: {
        id: 'reward',
        header: t('contractSearch.rewardColumn'),
        width: '12ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => row.reward,
        stackAffix: { after: t('contractSearch.courierMobile.rewardAffix') },
        render: (row) => <IskAmount value={row.reward} />,
      },
      collateral: {
        id: 'collateral',
        header: t('contractSearch.collateralColumn'),
        width: '12ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => courierCollateral(row),
        stackAffix: { after: t('contractSearch.courierMobile.collateralAffix') },
        render: (row) =>
          courierCollateral(row) === 0 ? '—' : <IskAmount value={courierCollateral(row)} />,
      },
      jumps: {
        id: 'jumps',
        header: t('contractSearch.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortFirst: 'asc',
        sortValue: (row) => jumpsByContract.get(row.contractId) ?? undefined,
        stackAffix: { after: t('contractSearch.courierMobile.jumpsAffix') },
        render: (row) => {
          if (jumps.kind === 'pending') return <span className="text-text-dim">…</span>;
          const count = jumpsByContract.get(row.contractId) ?? null;
          if (count === null) {
            return (
              <HintText
                content={t('contractSearch.jumpsUnavailableHint')}
                className="text-text-dim"
              >
                —
              </HintText>
            );
          }
          return row.destination.systemId == null ? (
            String(count)
          ) : (
            <JumpsLink
              systemId={row.destination.systemId}
              fromId={row.origin.systemId}
              preference={preferenceOverride}
              label={t('contractSearch.jumpsLinkLabel', { count })}
            >
              {count}
            </JumpsLink>
          );
        },
      },
      iskPerJump: {
        id: 'iskPerJump',
        header: t('contractSearch.iskPerJumpColumn'),
        width: '16ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        cardCorner: true,
        sortValue: (row) =>
          iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null) ?? undefined,
        render: (row) => {
          if (jumps.kind === 'pending') return <span className="text-text-dim">…</span>;
          const rate = iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null);
          const multiple = multipleFor(row);
          return (
            <div className="flex flex-col items-end gap-0.5">
              {rate === null ? (
                <span className="text-text-dim">—</span>
              ) : (
                <span className="whitespace-nowrap">
                  <IskAmount value={rate} />
                  <span className="text-[0.6875rem] font-semibold text-text-dim sm:hidden">
                    {t('contractSearch.courierMobile.perJumpSuffix')}
                  </span>
                </span>
              )}
              {multiple !== null && (
                <span
                  className={
                    paysFarAboveGoingRate(multiple)
                      ? 'flex items-center gap-1 text-[0.6875rem] font-normal text-warning'
                      : 'text-[0.6875rem] font-normal text-text-dim'
                  }
                >
                  {paysFarAboveGoingRate(multiple) && (
                    <>
                      <Icon.Warn className="size-3" aria-hidden="true" />
                      <span className="sr-only">{t('contractSearch.risk.overRateShort')}</span>
                    </>
                  )}
                  {t('contractSearch.goingRateMultiple', {
                    multiple: formatMagnitude(multiple),
                  })}
                </span>
              )}
            </div>
          );
        },
      },
      iskPerVolume: {
        id: 'iskPerVolume',
        header: t('contractSearch.iskPerVolumeColumn'),
        width: '14ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => iskPerVolume(row.reward, row.volume) ?? undefined,
        stackAffix: { after: t('contractSearch.courierMobile.iskPerVolumeAffix') },
        render: (row) => {
          const rate = iskPerVolume(row.reward, row.volume);
          return rate === null ? <span className="text-text-dim">—</span> : formatIskAuto(rate);
        },
      },
      expires: {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        width: COL_DATETIME_STACKED,
        className: 'whitespace-nowrap text-text-dim sm:px-2',
        headerClassName: 'sm:px-2',
        sortValue: (row) => row.dateExpired,
        stackAffix: { before: t('contractSearch.courierMobile.expiresAffix') },
        render: (row) => {
          const { date, time } = splitTimestamp(new Date(row.dateExpired), timeZone);
          const body = date.trimEnd();
          return (
            <>
              <span className="block [.dt-stacked_&]:inline">{body}</span>
              <span className="hidden [.dt-stacked_&]:inline">{date.slice(body.length)}</span>
              {time && <span className="block [.dt-stacked_&]:inline">{time}</span>}
            </>
          );
        },
      },
    }),
    [t, timeZone, jumps.kind, jumpsByContract, multipleFor, preferenceOverride]
  );

  const columns = useMemo<DataTableColumn<CourierRouteRow>[]>(() => {
    const originRegion = (row: CourierRouteRow) => regionLabel(row.origin.regionId, regionNames);
    const destinationRegion = (row: CourierRouteRow) =>
      regionLabel(row.destination.regionId, regionNames);
    const cols: DataTableColumn<CourierRouteRow>[] = [
      {
        id: 'route',
        header: t('contractSearch.routeColumn'),
        primary: true,
        sortValue: (row) =>
          `${endpointSystemName(row.origin)} ${endpointSystemName(row.destination)}`,
        render: (row) => (
          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
            <span className="max-w-full truncate">
              <EndpointSystem endpoint={row.origin} />
              <EndpointSecurity security={row.origin.security} />
              {originRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem] text-text-dim">{originRegion(row)}</span>
              )}
              <EndpointRiskMarkers endpoint={row.origin} end="origin" />
            </span>
            <span className="max-w-full truncate text-text-dim">
              {'→ '}
              <EndpointSystem endpoint={row.destination} />
              <EndpointSecurity security={row.destination.security} />
              {destinationRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem]">{destinationRegion(row)}</span>
              )}
              <EndpointRiskMarkers endpoint={row.destination} end="destination" />
            </span>
          </div>
        ),
      },
    ];
    for (const id of COURIER_COLUMN_IDS) {
      if (visibleColumns.includes(id)) cols.push(courierColumnsById[id]);
    }
    return cols;
  }, [t, regionNames, visibleColumns, courierColumnsById]);
  const courierSortProps = useUrlSort(
    'courier.sort',
    COURIER_SORT,
    columns.map((column) => column.id)
  );

  const courierCsvColumns = useMemo(
    () =>
      courierContractsCsvColumns(t, {
        regionName: (regionId) => regionLabel(regionId, regionNames),
        jumps: (row) => jumpsByContract.get(row.contractId) ?? null,
        goingRateMultiple: multipleFor,
      }),
    [t, regionNames, jumpsByContract, multipleFor]
  );
  const courierExport = useTableExport({
    surface: 'courier-contracts',
    rows: displayRows,
    columns: courierCsvColumns,
  });

  const groupBy = useMemo<DataTableGroupBy<CourierRouteRow>>(
    () => ({
      key: laneKey,
      renderHeader: (members) => (
        <LaneGroupHeader
          rows={members}
          regionNames={regionNames}
          pending={jumps.kind === 'pending'}
          rateFor={(row) => iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null)}
          multipleFor={multipleFor}
        />
      ),
      defaultExpanded: () => false,
    }),
    [regionNames, jumps.kind, jumpsByContract, multipleFor]
  );

  const stackSummary = useMemo(
    () =>
      t('contractSearch.courierMobile.summary', {
        hauls: t('contractSearch.courierMobile.laneHauls', { count: displayRows.length }),
        lanes: t('contractSearch.courierMobile.summaryLanes', { count: laneCount(displayRows) }),
      }),
    [t, displayRows]
  );

  const excludedUnplacedDestinations = useMemo(() => {
    if (matchingRows.length > 0 || !narrowsSpace(uiFilter.destinationSpace, spaceKinds)) {
      return false;
    }
    return filterCourierContracts(rows, { ...filter, destinationSpace: null }).some(
      (row) => row.destination.space === null
    );
  }, [matchingRows, rows, filter, uiFilter.destinationSpace, spaceKinds]);

  return (
    <>
      <CourierFilterBar
        filter={uiFilter}
        onChange={changeFilter}
        myRegion={myRegion}
        myRegionPending={myRegionPending}
        onResolveMyRegion={resolveMyRegion}
        originRegions={originRegions}
        destinationRegions={destinationRegions}
        spaceKinds={spaceKinds}
        resultCount={displayRows.length}
        preference={preference}
        onPreferenceChange={changePreference}
        actions={
          <>
            <ColumnPickerMenu
              available={COURIER_COLUMN_IDS}
              visible={visibleColumns}
              columnsById={courierColumnsById}
              onToggle={toggleColumn}
              buttonLabel={t('contractSearch.columnsButton')}
              menuTitle={t('contractSearch.columnsMenuTitle')}
            />
            <TableActionsMenu
              name={t('contractSearch.courierTitle')}
              tableExport={courierExport}
              size="md"
            />
          </>
        }
      />
      <div ref={resultsRef} tabIndex={-1} className="focus:outline-none">
        {displayRows.length === 0 ? (
          <EmptyState
            title={t('contractSearch.courierNoFilterMatches')}
            hint={t(
              excludedUnplacedDestinations
                ? 'contractSearch.courierNoFilterMatchesUnplacedHint'
                : 'contractSearch.courierNoFilterMatchesHint'
            )}
            className="py-8"
            action={
              <Button
                size="sm"
                onClick={() => changeFilter({ routeQuery: '', ...DEFAULT_COURIER_FILTER })}
              >
                {t('common.resetFilters')}
              </Button>
            }
          />
        ) : (
          <>
            {jumps.kind === 'unknown' && (
              <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">
                {t('contractSearch.jumpsSnapshotUnavailable')}
              </p>
            )}
            <DataTable
              {...courierExport.tableProps}
              label={t('contractSearch.courierTitle')}
              columns={columns}
              rows={displayRows}
              rowKey={(row) => String(row.contractId)}
              {...courierSortProps}
              onRowClick={setClickedRow}
              stackLayout="dense"
              mobileSort
              stackSummary={stackSummary}
              groupBy={groupBy}
              virtualize
            />
          </>
        )}
      </div>
      {selectedRow && reverseLane && (
        <CourierContractDetailModal
          row={selectedRow}
          regionNames={regionNames}
          jumps={
            jumps.kind === 'pending'
              ? PENDING_JUMPS
              : { kind: 'known', count: jumpsByContract.get(selectedRow.contractId) ?? null }
          }
          goingRateMultiple={multipleFor(selectedRow)}
          preference={preference}
          reverseLane={reverseLane}
          onSearchReverseLane={() => searchReverseLane(selectedRow)}
          onClose={() => setClickedRow(null)}
          returnFocusFallback={() => resultsRef.current}
          characterId={characterId}
          onStructurePlaced={onStructurePlaced}
        />
      )}
    </>
  );
}
