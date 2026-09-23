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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  IskAmount,
  type DataTableColumn,
  type DataTableGroupBy,
} from '@/components/ui';
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
import { SPACE_KINDS, type SpaceKind } from '@/engine/space';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  completableCourierRoutes,
  endpointRisks,
  type CourierRiskKind,
} from '@/engine/contracts/courierRisk';
import { EndpointRiskMarkers, RiskMarker } from '@/features/contractSearch/courierRiskDisplay';
import { MARKED_RISKS } from '@/features/contractSearch/courierRiskLabels';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { localJumpCountsForRoutes } from '@/features/route/localRoute';
import {
  CourierContractDetailModal,
  type CourierJumps,
  type ReverseLane,
} from '@/features/contractSearch/CourierContractDetailModal';
import { reverseLaneMatches } from '@/engine/contracts/courierReverseLane';
import { endpointSystemName } from '@/features/contractSearch/courierEndpointNames';
import { loadCharacterRegionId } from '@/features/contractSearch/characterRegion';
import { formatIskAuto, formatIskCompact } from '@/lib/isk';
import { formatMagnitude } from '@/lib/magnitude';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, enumParam, enumSetParam, optionalIdParam, textParam } from '@/lib/urlState';

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

/**
 * Both directions, because the flag reads two ways: a hauler avoiding the
 * documented bait wants these gone, and one who has read the conditions and
 * judged them for themselves wants only these. Neither reading is the app's to
 * make, so it offers both and defaults to neither.
 */
const OVER_RATE_FILTERS = ['all', 'only', 'hide'] as const;
type OverRateFilter = (typeof OVER_RATE_FILTERS)[number];

/** A blank or unparseable field is "no restriction", never `NaN` — which would silently exclude every row. */
function parseNumeric(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

/**
 * What the shortcut knows about where the character is. `unknown` until it is
 * asked — deliberately, because asking is what may cost a request, and the
 * board must not spend one on a control the hauler may never touch.
 */
type MyRegion =
  | { kind: 'unknown' }
  | { kind: 'region'; regionId: number }
  /** Asked, and there is no answer: no grant, offline, or a system the snapshot cannot place. */
  | { kind: 'unavailable' };

/**
 * One shared instance, for the same reason `PENDING` below is one: this is the
 * default every render that has no answer yet hands the control, and a fresh
 * object would re-render it continuously.
 */
const UNASKED: MyRegion = { kind: 'unknown' };

/**
 * "From my region": sets the origin filter to the region the active character
 * is standing in (issue #940).
 *
 * Region, not station or system, and the label says so. ESI answers this
 * question with a solar system; the filter beside it is region-scoped, so
 * naming anything finer would claim a precision the control does not have.
 *
 * The answer is *not* held here. `FilterBar` unmounts its controls whenever
 * the funnel closes or the sheet is dismissed, so state kept in this component
 * would be thrown away every time the hauler collapsed the bar — and the next
 * press would have to ask ESI all over again to re-learn something it had
 * already been told. The board above owns it instead; this only renders it.
 *
 * Three honest states once it has been asked. A region that no haul in the
 * current snapshot starts in disables the control and says so, rather than
 * setting a value the dropdown beside it has no option for — that would leave
 * the filter showing something its own control cannot represent, and an empty
 * table under it. An unresolvable location disables it with a plain reason: a
 * character whose grant predates `esi-location.read_location.v1` should find a
 * convenience missing, never a re-auth banner.
 */
function MyRegionButton({
  state,
  pending,
  options,
  onResolve,
  onPick,
}: {
  state: MyRegion;
  pending: boolean;
  options: RegionOption[];
  /** Asks the board to resolve the location, and answers with what it found. */
  onResolve: () => Promise<MyRegion>;
  onPick: (regionId: number) => void;
}) {
  const { t } = useTranslation();

  const offered = (regionId: number) => options.some((option) => option.id === regionId);
  const eligible = state.kind === 'region' && offered(state.regionId);
  // Disabled while in flight as much as for the answer: on a phone a double
  // tap is exactly how "at most one request" becomes two.
  const disabled =
    pending || state.kind === 'unavailable' || (state.kind === 'region' && !eligible);

  const message =
    state.kind === 'unavailable'
      ? t('contractSearch.fromMyRegionUnavailable')
      : state.kind === 'region' && !eligible
        ? t('contractSearch.noHaulsFromMyRegion')
        : null;

  async function handleClick() {
    // Already known and offered — the only way this click is reachable with an
    // answer in hand, since every other answer disables the button.
    if (state.kind === 'region') {
      onPick(state.regionId);
      return;
    }
    const resolved = await onResolve();
    if (resolved.kind === 'region' && offered(resolved.regionId)) onPick(resolved.regionId);
  }

  // A plain group rather than a `FilterField`: the button's own text is its
  // caption, and `FilterField` would stack an identical one above it in the
  // sheet. Same shape as the space chips below.
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={disabled} onClick={() => void handleClick()}>
        {t('contractSearch.fromMyRegion')}
      </Button>
      {/*
        The reason, announced and not only drawn: the button goes unfocusable
        in the same commit that renders this, so a screen reader following the
        control would otherwise be told nothing at all about why it died.
      */}
      {message && (
        <span role="status" className="text-xs text-text-dim">
          {message}
        </span>
      )}
    </div>
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
  myRegion: MyRegion;
  myRegionPending: boolean;
  onResolveMyRegion: () => Promise<MyRegion>;
  originRegions: RegionOption[];
  destinationRegions: RegionOption[];
  spaceKinds: readonly SpaceKind[];
  preference: RoutePreferenceKind;
  onPreferenceChange: (preference: RoutePreferenceKind) => void;
}

function CourierFilterBar({
  filter,
  onChange,
  myRegion,
  myRegionPending,
  onResolveMyRegion,
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
    filter.hideUncompletable,
    filter.overRate !== 'all',
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
          <MyRegionButton
            state={myRegion}
            pending={myRegionPending}
            onResolve={onResolveMyRegion}
            options={originRegions}
            onPick={(originRegionId) => setDraft({ ...draft, originRegionId })}
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
          {/*
            One control, not a per-flag set: a hauler either wants the jobs they
            may not be able to deliver out of the way or they do not. What it
            hides — and what it deliberately does not — is `blocksCompletion`'s
            to decide, which is more than the label has room to say: hence the
            tooltip, which states both halves and the nullsec exclusion.
          */}
          <FilterField label={t('contractSearch.overRateLabel')}>
            <Select
              value={draft.overRate}
              onValueChange={(value) => setDraft({ ...draft, overRate: value as OverRateFilter })}
            >
              <SelectTrigger className="w-44" aria-label={t('contractSearch.overRateLabel')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVER_RATE_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`contractSearch.overRate.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterChip
            label={t('contractSearch.hideUncompletableLabel')}
            tooltip={t('contractSearch.hideUncompletableTooltip')}
            selected={draft.hideUncompletable}
            onToggle={() => setDraft({ ...draft, hideUncompletable: !draft.hideUncompletable })}
          />
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
  'courier.pref': enumParam(ROUTE_PREFERENCES, DEFAULT_ROUTE_PREFERENCE),
  'courier.all': boolParam(),
};
const COURIER_SORT = { columnId: 'iskPerJump', direction: 'desc' } as const;

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
  const [params, setParams] = useUrlParams(COURIER_FILTER_PARAMS);
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
  const preference = params['courier.pref'];
  const showAll = params['courier.all'];
  const setShowAll = useCallback(
    (value: boolean) => setParams({ 'courier.all': value }),
    [setParams]
  );
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
  const jumps = useJumpCounts(rows, preference);

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
      'courier.all': false,
    });
  }

  /**
   * Go look at the way home: the same board, with only the two region fields
   * swapped. Through `changeFilter` rather than `setUiFilter`, so the row cap
   * resets the way it does for every other filter change.
   */
  function searchReverseLane(row: CourierRouteRow) {
    setSelectedRow(null);
    changeFilter({
      ...uiFilter,
      originRegionId: row.destination.regionId,
      destinationRegionId: row.origin.regionId,
    });
  }

  function changePreference(next: RoutePreferenceKind) {
    setParams({ 'courier.pref': next, 'courier.all': false });
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
              <EndpointSecurity security={row.origin.security} />
              {originRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem] text-text-dim">{originRegion(row)}</span>
              )}
              <EndpointRiskMarkers endpoint={row.origin} end="origin" />
            </span>
            <span className="text-text-dim">
              {'→ '}
              {endpointSystemName(row.destination)}
              <EndpointSecurity security={row.destination.security} />
              {destinationRegion(row) && (
                <span className="ml-1.5 text-[0.6875rem]">{destinationRegion(row)}</span>
              )}
              <EndpointRiskMarkers endpoint={row.destination} end="destination" />
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
        stackAffix: { after: t('contractSearch.courierMobile.rewardAffix') },
        // Long press, not tap: the row's own tap opens the haul's detail modal.
        render: (row) => <IskAmount value={row.reward} revealOn="longPress" />,
      },
      {
        id: 'collateral',
        header: t('contractSearch.collateralColumn'),
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
          courierCollateral(row) === 0 ? (
            '—'
          ) : (
            <IskAmount value={courierCollateral(row)} revealOn="longPress" />
          ),
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
        stackAffix: { after: t('contractSearch.courierMobile.jumpsAffix') },
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
                  <IskAmount value={rate} revealOn="longPress" />
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
                <span
                  className={
                    paysFarAboveGoingRate(multiple)
                      ? 'rounded-xs border border-warning/40 px-1 text-[0.6875rem] font-normal text-warning'
                      : 'text-[0.6875rem] font-normal text-text-dim'
                  }
                >
                  {t('contractSearch.goingRateMultiple', {
                    multiple: formatMagnitude(multiple),
                  })}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'iskPerVolume',
        header: t('contractSearch.iskPerVolumeColumn'),
        align: 'right',
        className: 'tabular-nums whitespace-nowrap',
        sortValue: (row) => iskPerVolume(row.reward, row.volume) ?? undefined,
        stackAffix: { after: t('contractSearch.courierMobile.iskPerVolumeAffix') },
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
        stackAffix: { before: t('contractSearch.courierMobile.expiresAffix') },
        render: (row) => formatTimestamp(new Date(row.dateExpired), timeZone),
      },
    ];
  }, [t, regionNames, timeZone, jumps.kind, jumpsByContract, multipleFor]);
  const courierSortProps = useUrlSort(
    'courier.sort',
    COURIER_SORT,
    columns.map((column) => column.id)
  );

  const visibleRows = showAll ? displayRows : displayRows.slice(0, ROW_CAP);

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

  /**
   * Counted over every haul the filters kept, not the capped page on screen:
   * "50 hauls" when there are 214 would be the cap talking, not the board.
   */
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
            {...courierSortProps}
            onRowClick={setSelectedRow}
            // Hundreds of hauls are scanned, not read: the dense two-line card
            // fits three times the labelled one on a phone.
            stackLayout="dense"
            mobileSort
            stackSummary={stackSummary}
            groupBy={groupBy}
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
        />
      )}
    </>
  );
}
