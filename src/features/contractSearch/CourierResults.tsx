/**
 * The Contracts page's Courier tab (issue #910): public
 * courier contracts as hauls to take, not items to buy.
 *
 * Its own component rather than a branch inside `ContractSearchPanel` because
 * the two modes share no filter and no column — a haul has no item, no
 * quantity and no price, and an offer has no route, reward or collateral. The
 * panel owns the snapshot, the mode and the region names; this owns
 * everything that is only true of a haul.
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { HintText } from '@/components/ui/HintText';
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

/**
 * This end's system security status, printed right after the system name
 * ("Jita 0.9"). The number rather than the Space filter's band word: a 0.5
 * gank system and a 1.0 core system are both "Highsec", and a hauler reads the
 * difference — the number carries the band anyway, so nothing is lost.
 *
 * Endpoint security, never route security: a highsec pickup and a highsec
 * delivery can still route through lowsec, and this app cannot know — a
 * per-row route lookup is the ESI fan-out all three courier scope decisions
 * refuse. So the number describes the end it sits beside and claims nothing
 * about the trip between them.
 *
 * Nothing at all for an end nothing local places, rather than an "unknown":
 * the bare id in the name slot, and the Structure marker where it applies,
 * already say it is unplaced — a third word for it only crowds a phone card.
 */
function EndpointSecurity({ security }: { security: number | null }) {
  if (security === null) return null;
  return <SecurityStatus security={security} className="ml-1" />;
}

/**
 * The phone's lane key (`DataTable`'s `groupBy`): hauls between the same two
 * systems fold into one row. Systems, not stations or regions — "Jita →
 * Amarr" is how a hauler names a lane, and ten contracts on it are one
 * decision about which to take. An end with no system never groups: two
 * unplaced ends are not known to be the same place.
 */
function laneKey(row: CourierRouteRow): string | null {
  if (row.origin.systemId === null || row.destination.systemId === null) return null;
  return `${row.origin.systemId}>${row.destination.systemId}`;
}

/** Distinct lanes across these hauls, counting every unplaced haul as its own. */
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

/** The Courier board's own filter, route preference and show-all, in the URL (ADR 0015) as one group. */
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
  // Absent means the pilot's Travel default (Settings → Travel), not a fixed one.
  'courier.pref': optionalEnumParam(ROUTE_PREFERENCES),
};
const COURIER_SORT = { columnId: 'iskPerJump', direction: 'desc' } as const;

type CourierFilterParams = UrlParamValues<typeof COURIER_FILTER_PARAMS>;

/**
 * The remembered filter (issue #1719, `courierFilterPref.ts`) as the URL
 * group's own fields — the stored default `useRememberedUrlParams` falls back
 * to for each field a link leaves out. `courier.q` and `courier.pref` are
 * absent: neither is remembered here — an absent `courier.pref` falls to the
 * pilot's Travel default instead.
 */
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

/** The inverse of `rememberedParams`, for only the fields an edit touched. */
function storedPatch(patch: Partial<CourierFilterParams>): Partial<StoredCourierFilter> {
  const result: Partial<StoredCourierFilter> = {};
  // `in` for the two region fields: `null` ("any region") is a real edit
  // there, where for every other field `undefined` just means "not touched".
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

/** The modal's own pending value, stable for the same reason `PENDING` is. */
const PENDING_JUMPS: CourierJumps = { kind: 'pending' };

function useJumpCounts(rows: readonly CourierRouteRow[], route: JumpBasis): JumpsState {
  // The answer carries the inputs it was computed for, so "pending" is
  // *derived* during render rather than written by the effect: an answer whose
  // inputs are no longer the current ones is stale by definition, and the
  // board reads as loading the instant they change, with no extra render.
  const [answer, setAnswer] = useState<{
    rows: readonly CourierRouteRow[];
    routeKey: string;
    state: JumpsState;
  } | null>(null);
  const { rules, network, key: routeKey, hydrated } = route;

  useEffect(() => {
    // Held until the Travel Settings are in, so the board does not rank once without them.
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

/** A system name, plain: a courier row opens its contract modal, where the system links to Route Safety. */
function EndpointSystem({ endpoint }: { endpoint: CourierRouteRow['origin'] }) {
  const name = endpointSystemName(endpoint);
  // Plain: the row opens the contract modal, which carries the system link.
  return <span className={entityLinkClassName()}>{name}</span>;
}

/**
 * A folded lane's toggle on a phone: the lane itself, how many hauls run it,
 * the best ISK/jump among them, and every warning any of them carries.
 *
 * The warnings are the load-bearing part. A group is collapsed by default, so
 * a bait contract sitting third in a lane of ten would otherwise be invisible
 * until someone tapped — and the whole point of the over-rate and structure
 * markers is that nobody has to go looking for them. So the header shows the
 * union of its members' markers, once each.
 *
 * The best rate is the group's maximum, not its first member's: the sort
 * picker can order the members by anything, and "what is this lane worth at
 * best" must not change when the reader sorts by expiry.
 *
 * Rendered inside the toggle `<button>`, so everything here is plain text —
 * no `IskAmount` long-press reveal, which would be a control inside a control.
 * Documented exception to the IskAmount rule: `formatIskCompact` stays here.
 */
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
  // `MARKED_RISKS`' own order, so every lane lists its markers the same way.
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
  /** Non-null: the panel above this one does not render a board without an active character. */
  characterId: number;
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
export function CourierResults({ rows, regionNames, characterId }: CourierResultsProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  // The remembered filter (issue #1719): a default for each field a link
  // leaves out, never mirrored back into the URL (decision
  // `20260922-221531` / ADR 0015) — see `courierFilterPref.ts`.
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
  // The board's own picker, if one is set: carried into the route a count opens.
  const preferenceOverride = params['courier.pref'];
  const routeQuery = useJumpBasis(preferenceOverride);
  const preference = routeQuery.rules.preference;
  const [selectedRow, setSelectedRow] = useState<CourierRouteRow | null>(null);

  // Where the character is (issue #940), owned here rather than by the control
  // that shows it, because `FilterBar` unmounts its controls on every collapse.
  //
  // Both pieces carry the character they were learned for, so a character
  // switch invalidates them *during render* rather than through an effect that
  // resets them — the same shape as `useJumpCounts` above, and for the same
  // reason: an answer about someone else is stale by definition, and a
  // resolve still in flight when the switch happens cannot land on the new
  // character's board.
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
      // A snapshot or cache read that throws is still just "no answer" — and
      // it must not leave the button stuck pending and silently dead.
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

  /**
   * Applied after the engine filter rather than inside it: what counts as "may
   * not be able to complete" is the risk module's answer, and keeping it there
   * stops a second definition drifting away from the flags on the row.
   *
   * Shared with the reverse-lane count below, so the way home is narrowed by
   * the same control, on the same terms, as the board in front of it.
   */
  const narrowToCompletable = useCallback(
    (candidates: readonly CourierRouteRow[]) =>
      uiFilter.hideUncompletable ? completableCourierRoutes(candidates) : [...candidates],
    [uiFilter.hideUncompletable]
  );

  const matchingRows = useMemo(
    () => narrowToCompletable(filterCourierContracts(rows, filter)),
    [rows, filter, narrowToCompletable]
  );
  /**
   * Measured over the **whole** corpus rather than the filtered set, because
   * the going rate below is the median across every outstanding public courier
   * contract (#946) — a median that moved every time a filter changed would be
   * a comparison against the rows still on screen rather than against the
   * market. Costs no more than the unfiltered case already did, and the counts
   * are then looked up by contract id instead of by position.
   */
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

  /** A row's own count, found by its id — see `jumps` for why not by position. */
  const jumpsByContract = useMemo(() => {
    const byContract = new Map<number, number | null>();
    if (jumps.kind !== 'known') return byContract;
    rows.forEach((row, index) => {
      byContract.set(row.contractId, jumps.counts[index] ?? null);
    });
    return byContract;
  }, [rows, jumps]);

  /**
   * The market's own going rate: the median reward per m³ per jump across the
   * corpus, computed from the snapshot with nothing typed in. `null` until the
   * distances land, and for a corpus too small for a median to mean anything —
   * in which case no row shows a multiple at all, rather than every row showing
   * one against two samples.
   */
  const goingRate = useMemo(
    () =>
      corpusGoingRate(
        rows.map((row) =>
          rewardPerVolumeJump(row.reward, row.volume, jumpsByContract.get(row.contractId) ?? null)
        )
      ),
    [rows, jumpsByContract]
  );

  /**
   * How this haul's rate compares with the market's. `null` whenever either
   * half is unstatable — no distance, no cargo volume, or a corpus too small
   * for a median — so a row shows nothing rather than a figure computed
   * without one of its terms.
   */
  const multipleFor = useCallback(
    (row: CourierRouteRow) =>
      goingRateMultiple(
        rewardPerVolumeJump(row.reward, row.volume, jumpsByContract.get(row.contractId) ?? null),
        goingRate
      ),
    [jumpsByContract, goingRate]
  );

  /**
   * Applied here rather than in `matchingRows`, because a multiple needs the
   * going rate, which needs the distances — none of which the row filter has.
   * A haul whose multiple cannot be stated is never removed by either
   * direction: "we cannot say" is not "within the going rate", and it is not
   * "far above" it either.
   */
  const narrowToOverRate = useCallback(
    (candidates: readonly CourierRouteRow[]) => {
      // Until the distances land no row has a multiple, so narrowing on one
      // would empty the board and the empty state would report "nothing
      // matched" — a complete answer given mid-load. The board shows everything
      // until it can actually tell these apart.
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

  /**
   * Best rate first. Changing the preference changes every jump count and
   * therefore this order. Until the counts arrive the rate is unknown for
   * every row, so the fallback order is by reward — the board stays useful
   * mid-load instead of shuffling from an order that means nothing.
   */
  const displayRows = useMemo(() => {
    const ranked = [...ratedRows];
    if (jumps.kind !== 'known') return ranked.sort((a, b) => b.reward - a.reward);
    const rate = (row: CourierRouteRow) =>
      // A haul with no measurable distance has no rate, and sorts last rather
      // than as zero — "we cannot say" is not "pays nothing".
      iskPerJump(row.reward, jumpsByContract.get(row.contractId) ?? null) ?? -1;
    return ranked.sort((a, b) => rate(b) - rate(a));
  }, [ratedRows, jumps, jumpsByContract]);

  /**
   * The open haul's return leg (issue #941), measured over the whole corpus
   * with the board's own filter and its two regions swapped. `null` when no
   * haul is open — which is not the modal's "no lane to look up", and must not
   * borrow its tag.
   *
   * Every stage the board narrows by is applied here too, including the
   * over-rate filter. That one needs the jump counts, so it is gated on them
   * exactly as `ratedRows` is: with the distances still landing neither the
   * board nor this count applies it, and once they land both do. Anything less
   * than the same stages would let the count promise hauls the board it opens
   * then filters away — the dead link the zero case below exists to prevent.
   */
  const reverseLane = useMemo<ReverseLane | null>(() => {
    if (selectedRow === null) return null;
    const lane = reverseLaneMatches(selectedRow, rows, filter);
    if (lane === null) return { kind: 'unresolved' };
    return {
      kind: 'counted',
      count: narrowToOverRate(narrowToCompletable(lane.matches)).length,
      // Narrowed the same way, because these are hauls the board would hide
      // too: a drop-off nothing local places is a `player-structure` flag, and
      // that flag blocks completion. An end the snapshot could not read at all
      // is not flagged, and survives — which is the honest difference.
      unplaceable: narrowToCompletable(lane.unplaceable).length,
    };
  }, [selectedRow, rows, filter, narrowToCompletable, narrowToOverRate]);

  /**
   * `FilterBar` commits the whole filter on every single-field edit;
   * `useRememberedUrlParams` diffs it against what is shown, so only the
   * field(s) this edit touched reach the URL and the remembered filter.
   */
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

  /**
   * Go look at the way home: the same board, with only the two region fields
   * swapped. Through `changeFilter` rather than `setUiFilter`, so it is
   * remembered the way every other filter change is.
   */
  const focusAfterCommit = useFocusAfterCommit();
  const resultsRef = useRef<HTMLDivElement>(null);

  function searchReverseLane(row: CourierRouteRow) {
    setSelectedRow(null);
    // The row that opened the detail is filtered out, so focus goes to the results.
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
        // Long press, not tap: the row's own tap opens the haul's detail modal.
        render: (row) => <IskAmount value={row.reward} />,
      },
      collateral: {
        id: 'collateral',
        header: t('contractSearch.collateralColumn'),
        width: '12ch',
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => courierCollateral(row),
        // A no-collateral haul reads "— collat" on the phone card, which says
        // "none asked" as plainly as the em dash does in the table.
        stackAffix: { after: t('contractSearch.courierMobile.collateralAffix') },
        // A haul that asks for no collateral is a real, distinct offer — an em
        // dash says "none asked", where "0.00 ISK" reads as a figure the issuer
        // actually typed.
        render: (row) =>
          courierCollateral(row) === 0 ? '—' : <IskAmount value={courierCollateral(row)} />,
      },
      jumps: {
        id: 'jumps',
        header: t('contractSearch.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        // `undefined`, never a stand-in figure: `DataTable` sinks a valueless
        // row to the end in *either* direction, where a large or small
        // sentinel would lead the table on one of them.
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
        // The phone card's headline figure, top right beside the route: the
        // number the board ranks by is the one a thumb scans down. A flag,
        // not a position — the dense card hoists it by CSS `order`, so the
        // desktop column order is untouched.
        cardCorner: true,
        /** Same rule as Jumps above: no rate sinks the row, in either direction. */
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
                // Compact like Reward beside it, exact on long press (a row
                // tap opens the modal). The " /J" only shows on the phone
                // card, which has no column header to name the figure.
                <span className="whitespace-nowrap">
                  <IskAmount value={rate} />
                  <span className="text-[0.625rem] font-semibold text-text-dim sm:hidden">
                    {t('contractSearch.courierMobile.perJumpSuffix')}
                  </span>
                </span>
              )}
              {/*
                A second line in the cell rather than an eighth column: the
                table is already seven wide. It names its own benchmark inline,
                because it is a multiple of the corpus median per m³ per jump
                rather than of the ISK/jump figure printed above it.

                Right-aligned at every width: in the table it sits under a
                right-aligned header, and on the phone's dense card this cell is
                the top-right corner, where both lines hug the card's edge.
                `font-normal` because the corner is bold, and only the figure
                should be.
              */}
              {multiple !== null && (
                <span className="flex items-center gap-1">
                  <span
                    className={
                      paysFarAboveGoingRate(multiple)
                        ? 'text-[0.6875rem] font-normal text-warning'
                        : 'text-[0.6875rem] font-normal text-text-dim'
                    }
                  >
                    {t('contractSearch.goingRateMultiple', {
                      multiple: formatMagnitude(multiple),
                    })}
                  </span>
                  {/* Colour alone used to be the only tell that this multiple
                      is flagged (DESIGN.md §7) — the mobile lane header
                      already names it via `RiskMarker`; this repeats that
                      same word here. */}
                  {paysFarAboveGoingRate(multiple) && (
                    <RiskMarker
                      kind="over-rate"
                      detailOptions={{ multiple: formatMagnitude(multiple) }}
                    />
                  )}
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
        // `formatIskAuto`, not whole ISK: this rate spans orders of magnitude
        // the ISK/jump column never sees, and whole-ISK formatting clamps
        // anything under half an ISK to "0" — which would print a low-paying
        // bulk haul exactly like the deliberate zero of a favour run.
        // Exception to "IskAmount for compact figures": a sub-ISK rate is not compact.
        render: (row) => {
          const rate = iskPerVolume(row.reward, row.volume);
          return rate === null ? <span className="text-text-dim">—</span> : formatIskAuto(rate);
        },
      },
      expires: {
        id: 'expires',
        header: t('contractSearch.expiresColumn'),
        width: COL_DATETIME_STACKED,
        // `sm:px-2` (a variant, so it sorts after the base `px-3`) claws back the last few px a 1024px panel is short once the cell stacks.
        className: 'whitespace-nowrap text-text-dim sm:px-2',
        headerClassName: 'sm:px-2',
        sortValue: (row) => row.dateExpired,
        stackAffix: { before: t('contractSearch.courierMobile.expiresAffix') },
        // Date over time in the table so the column stays narrow enough for its panel at 1024px;
        // the stacked phone card (`.dt-stacked`) keeps one line.
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
          <div className="flex flex-col gap-0.5">
            <span className="truncate">
              <EndpointSystem endpoint={row.origin} />
              <EndpointSecurity security={row.origin.security} />
              {originRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem] text-text-dim">{originRegion(row)}</span>
              )}
              <EndpointRiskMarkers endpoint={row.origin} end="origin" />
            </span>
            <span className="truncate text-text-dim">
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
      }),
    [t, regionNames, jumpsByContract]
  );
  const courierExport = useTableExport({
    surface: 'courier-contracts',
    rows: displayRows,
    columns: courierCsvColumns,
  });

  /**
   * Phone-only lane folding. Memoised because `DataTable` regroups whenever
   * this object's identity changes, and the jump counts it reads land after
   * the first render. Collapsed by default: the header already says what the
   * lane is worth and what it warns of, and a phone shows one line per lane
   * instead of ten near-identical cards.
   */
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

  /** Counted over every haul the filters kept, not the rows mounted on screen. */
  const stackSummary = useMemo(
    () =>
      t('contractSearch.courierMobile.summary', {
        hauls: t('contractSearch.courierMobile.laneHauls', { count: displayRows.length }),
        lanes: t('contractSearch.courierMobile.summaryLanes', { count: laneCount(displayRows) }),
      }),
    [t, displayRows]
  );

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
        myRegion={myRegion}
        myRegionPending={myRegionPending}
        onResolveMyRegion={resolveMyRegion}
        originRegions={originRegions}
        destinationRegions={destinationRegions}
        spaceKinds={spaceKinds}
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
              // One row per contract here — unlike the offers snapshot, where one
              // contract lists an item line per stack — so `contractId` alone is
              // a unique key.
              rowKey={(row) => String(row.contractId)}
              {...courierSortProps}
              onRowClick={setSelectedRow}
              // Hundreds of hauls are scanned, not read: the dense two-line card
              // fits three times the labelled one on a phone.
              stackLayout="dense"
              mobileSort
              stackSummary={stackSummary}
              groupBy={groupBy}
              // Every haul the filters keep, windowed rather than capped. Phone
              // lane grouping renders unwindowed — collapsed lanes mount nothing.
              virtualize
            />
          </>
        )}
      </div>
      {selectedRow && reverseLane && (
        <CourierContractDetailModal
          row={selectedRow}
          regionNames={regionNames}
          // The board already read the graph for every row, so the modal is
          // handed the answer rather than resolving its own. `unknown` folds
          // into a `null` count: an unreadable snapshot and a route that does
          // not exist are both "no distance to quote" at this surface.
          jumps={
            jumps.kind === 'pending'
              ? PENDING_JUMPS
              : { kind: 'known', count: jumpsByContract.get(selectedRow.contractId) ?? null }
          }
          goingRateMultiple={multipleFor(selectedRow)}
          preference={preference}
          reverseLane={reverseLane}
          onSearchReverseLane={() => searchReverseLane(selectedRow)}
          onClose={() => setSelectedRow(null)}
          returnFocusFallback={() => resultsRef.current}
        />
      )}
    </>
  );
}
