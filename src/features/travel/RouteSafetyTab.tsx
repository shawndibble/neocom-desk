/**
 * Travel › Route Safety (issue #2328): every system on a stargate route, with
 * its security, region, and the last hour of jumps and kills ESI reports.
 *
 * Conditions, never verdicts (decision `20260912-172628`): the page says "12
 * ship kills in the last hour" and marks a Gank Chokepoint by name. It never
 * calls a system or a route safe, unsafe or anything else — the pilot decides.
 *
 * From, the Stops and the Route Preference live in the URL so a route can be
 * shared. The picker saves the pilot's default Route Preference (the one
 * Settings → Travel shows) and drops the link's override; a link that names
 * `pref` still wins until the picker is used. From falls back to the Current
 * System when the link does not name one.
 *
 * Planner layout (issue #2472): a left column with the Route rules panel —
 * the Route Preference for this route, and the pilot's Travel Settings edited
 * in place — and the route on the right. Every middle row can Avoid its
 * system, previewing the whole trip with it avoided before it saves.
 *
 * Itinerary (issue #2474): one panel holds the route's facts as a chip strip,
 * the route strip (`RouteStrip`), and one-line rows with quiet stretches
 * folded (`RouteSystemsTable`).
 *
 * Several Stops (issue #2475): the Stops panel sits above Route rules, and a
 * trip of more than one stop lists its Legs, each with its own header and
 * rows (`TripLegs`); the facts line and strip cover the whole trip. The stops
 * live in the link as `stops`, in the order typed; a legacy `to` link still
 * opens as a single stop. One stop is the page exactly as it was.
 *
 * Thera / Turnur (issue #2476): with "Route through Thera / Turnur" on, the
 * open holes EVE-Scout lists join the route's graph (`useRouteHoles`), and a
 * hole jump is its own row, a hatched strip cell, and a count on the facts
 * line. The four settings are this page's synced defaults, each overridable
 * in the link (`wh`, `whsize`, `whlife`, `whhub`). While the list loads the
 * gate route shows and says so; if EVE-Scout cannot be reached the route is
 * gates only, and says that too.
 *
 * Set waypoints in game (issue #2479) closes the facts line (`SetWaypoints`).
 *
 * Ansiblex (issue #2478): with Use jump bridges on (a device-local default,
 * overridable in the link as `jb`), the gates in this device's Ansiblex list
 * join the route as one-jump connections, each crossing its own row, and
 * each leg may list Via Ansiblex. The list is found with a character's
 * structure search or pasted (`AnsiblexGatesDialog`).
 *
 * Ways to fly each leg (issue #2477): beside each leg's rows, gates only and
 * the way through each hub with a qualifying hole, with facts side by side
 * (`LegWays`). Use for this leg pins one in the link (`pin`), and a Thera /
 * Turnur row's Route via opens this page with its hole pinned for the first
 * leg (`routeSafetyLink.ts`). Editing the stops or their order drops the
 * pins, which belong to legs by position — except the first stop added to a
 * Route via link, which is the leg its pin was made for.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  DataAgeBadge,
  EmptyState,
  PageHeader,
  Panel,
  Spinner,
  StatChip,
  StatChips,
} from '@/components/ui';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import type { TheraConnection } from '@/engine/route/theraConnections';
import { MAX_STOPS } from '@/engine/route/tripPlan';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { saveRouteHoleDefault, useRouteHoleQuery } from '@/features/route/routeHoleSettings';
import {
  useAvoidedSystemsEnabled,
  useDefaultRoutePreference,
  useRouteQuery,
} from '@/features/route/routeRules';
import { useRouteBridgeQuery, useRouteBridgesEnabled } from '@/features/route/routeBridgeSettings';
import { useSolarSystemIndex, useSystemName } from '@/features/route/useSolarSystems';
import { useUrlParams } from '@/lib/useUrlState';
import { AnsiblexGatesDialog, type AnsiblexDialogMode } from './AnsiblexGatesDialog';
import { useAnsiblexGates } from './ansiblexGates';
import { AvoidSystemDialog, type AvoidTarget } from './AvoidSystemDialog';
import { LegBody, type LegWaysProps } from './LegWays';
import { RouteRulesPanel } from './RouteRulesPanel';
import { RouteStrip } from './RouteStrip';
import { RouteSystemsTable, type HoleRowProps } from './RouteSystemsTable';
import { ROUTE_PARAMS } from './routeSafetyLink';
import { routeSystemName } from './routeSystemName';
import { SetWaypoints } from './SetWaypoints';
import { StopsPanel, type StopOrderSettings } from './StopsPanel';
import { TripLegs } from './TripLegs';
import { useRouteHoles, type RouteHolesState } from './useRouteHoles';
import { useRouteKills, type RouteKillsCell } from './useRouteKills';
import { useRouteSafety, type RouteSafetyLeg } from './useRouteSafety';

/** The link parameter overriding each wormhole setting. */
const HOLE_PARAM = {
  enabled: 'wh',
  shipSize: 'whsize',
  minLifeHours: 'whlife',
  hubs: 'whhub',
} as const;

const NO_HOLES: readonly TheraConnection[] = [];

/** The stops a link names: `stops`, else a legacy `to`, each once, at most `MAX_STOPS`. */
function stopsFromLink(stops: readonly number[], to: number | null): number[] {
  const named = stops.length > 0 ? stops : to === null ? [] : [to];
  return [...new Set(named)].slice(0, MAX_STOPS);
}

/**
 * The route's facts as a `StatChips` strip: jumps (by gate · through
 * wormholes · over Ansiblex, when a hole or bridge is flown) · bands · lowest
 * · last hour's kills · chokepoints. Each is a labelled figure rather than
 * prose, so a wrapped line still reads as separate facts.
 */
function RouteFacts({
  summary,
  holeJumps,
  bridgeJumps,
}: {
  summary: RouteSafetySummary;
  holeJumps: number;
  bridgeJumps: number;
}) {
  const { t } = useTranslation();
  const flownOtherwise = holeJumps > 0 || bridgeJumps > 0;
  return (
    <div role="group" aria-label={t('travel.summary.label')} className="min-w-0">
      <StatChips>
        <StatChip label={t('travel.summary.jumpsLabel')} value={summary.jumps} />
        {flownOtherwise && (
          <StatChip
            label={t('travel.summary.byGateLabel')}
            value={summary.jumps - holeJumps - bridgeJumps}
          />
        )}
        {holeJumps > 0 && <StatChip label={t('travel.summary.holesLabel')} value={holeJumps} />}
        {bridgeJumps > 0 && (
          <StatChip label={t('travel.summary.bridgesLabel')} value={bridgeJumps} />
        )}
        <StatChip label={t('travel.summary.highsecLabel')} value={summary.highsec} />
        <StatChip label={t('travel.summary.lowsecLabel')} value={summary.lowsec} />
        <StatChip label={t('travel.summary.nullsecLabel')} value={summary.nullsec} />
        {summary.lowestSecurity !== null && (
          <StatChip
            label={t('travel.summary.lowestLabel')}
            value={<SecurityStatus security={summary.lowestSecurity} />}
          />
        )}
        {summary.shipKills !== null && summary.podKills !== null && (
          <StatChip
            label={t('travel.summary.killsLabel')}
            value={t('travel.summary.killsValue', {
              ships: summary.shipKills.toLocaleString(),
              pods: summary.podKills.toLocaleString(),
            })}
          />
        )}
        <StatChip
          label={t('travel.summary.chokepointsLabel')}
          value={
            summary.chokepoints.length === 0
              ? t('travel.summary.chokepointsNone')
              : summary.chokepoints.join(', ')
          }
          tone={summary.chokepoints.length === 0 ? 'default' : 'warning'}
        />
      </StatChips>
    </div>
  );
}

export function RouteSafetyTab({ tabBar }: { tabBar: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(ROUTE_PARAMS);
  const current = useCurrentSystem();
  const fromId = params.from ?? current.systemId;
  const fromIsCurrent = params.from === null && current.systemId !== null;
  const fromName = useSystemName(fromId);
  const systems = useSolarSystemIndex();
  const stopsKey = stopsFromLink(params.stops, params.to).join(',');
  const stops = useMemo(() => (stopsKey === '' ? [] : stopsKey.split(',').map(Number)), [stopsKey]);
  const settings: StopOrderSettings = {
    optimize: params.opt,
    returnToStart: params.ret,
    keepLastStopLast: params.keep,
  };
  // The two options are the optimizer's own: with it off, the typed order is flown as typed.
  const optimizing = settings.optimize && stops.length > 1;
  const routeQuery = useRouteQuery(params.pref);
  const holeQuery = useRouteHoleQuery({
    enabled: params.wh,
    shipSize: params.whsize,
    minLifeHours: params.whlife,
    hubs: params.whhub,
  });
  const holesState = useRouteHoles(holeQuery);
  const holes = holesState.kind === 'ready' ? holesState.holes : NO_HOLES;
  const listed = holesState.kind === 'ready' ? holesState.listed : null;
  const bridgeQuery = useRouteBridgeQuery(params.jb);
  const gateRecords = useAnsiblexGates();
  // `null` while the switch is off; held off too until the switch and the list are read.
  const bridges =
    bridgeQuery.enabled && bridgeQuery.hydrated && gateRecords !== undefined ? gateRecords : null;
  const [bridgeDialog, setBridgeDialog] = useState<AnsiblexDialogMode | null>(null);
  const state = useRouteSafety({
    fromId,
    stops,
    tripOptions: {
      optimize: optimizing,
      returnToStart: optimizing && settings.returnToStart,
      keepLastStopLast: optimizing && settings.keepLastStopLast,
    },
    // Held until Use jump bridges and the list are read, so the route is not drawn once without them.
    route: {
      ...routeQuery,
      hydrated: routeQuery.hydrated && bridgeQuery.hydrated && gateRecords !== undefined,
    },
    holes,
    pins: params.pin,
    listed,
    bridges,
  });
  const pinLeg = (index: number, pin: string | null) => {
    const next = [...params.pin];
    while (next.length <= index) next.push('');
    next[index] = pin ?? '';
    setParams({ pin: next }, { push: true });
  };
  // Each system once, in flight order: a trip can cross one twice.
  const routeSystems = useMemo(() => {
    if (state.kind !== 'route') return null;
    const seen = new Map<number, RouteSafetyRow>();
    for (const leg of state.legs) {
      for (const row of leg.rows ?? []) if (!seen.has(row.systemId)) seen.set(row.systemId, row);
    }
    return [...seen.values()].map((row) => ({ systemId: row.systemId, band: row.band }));
  }, [state]);
  const killsOf = useRouteKills(routeSystems);
  const avoided = useAvoidedSystems((s) => s.value);
  const avoidedEnabled = useAvoidedSystemsEnabled((s) => s.value);
  const [avoidTarget, setAvoidTarget] = useState<AvoidTarget | null>(null);
  // The trip's own start and stops cannot be avoided; a system already on an
  // active list has nothing to add. The preview covers the whole trip, so the
  // leg it was asked from does not matter.
  const avoidAction = (_leg: RouteSafetyLeg, row: RouteSafetyRow) =>
    row.systemId === fromId ||
    stops.includes(row.systemId) ||
    (avoidedEnabled && avoided.includes(row.systemId))
      ? null
      : () => setAvoidTarget({ systemId: row.systemId, name: routeSystemName(row) });

  const fromTrigger =
    fromId === null
      ? t('travel.pickSystem')
      : fromIsCurrent
        ? t('travel.currentSystem', { system: fromName ?? '…' })
        : (fromName ?? '…');
  const nameOf = (systemId: number) =>
    systems?.get(systemId)?.name ?? t('travel.stops.unnamed', { id: systemId });
  const orderNote =
    state.kind === 'route' && state.reordered
      ? t('travel.stops.orderChanged', {
          order: state.reordered.stops.map(nameOf).join(t('travel.stops.orderSeparator')),
          typed: t('travel.summary.jumps', { count: state.reordered.typedJumps }),
          jumps: t('travel.summary.jumps', { count: state.reordered.jumps }),
        })
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('travel.title')}
        meta={
          state.kind === 'route' && state.fetchedAt !== null ? (
            <DataAgeBadge date={state.fetchedAt} note={t('travel.dataAgeNote')} />
          ) : undefined
        }
      />
      {tabBar}
      {/* The route table needs ~612px but only gets ~427px beside the rail at 1024, so the
          rail and route sit side by side only from `xl` (#2591). Below it the rail
          dissolves (`contents`) so Stops, the route, then Route rules stack in order. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="contents xl:block xl:space-y-4">
          <div className="order-1 xl:order-none">
            <StopsPanel
              fromId={fromId}
              fromName={fromId === null ? fromTrigger : nameOf(fromId)}
              fromTrigger={fromTrigger}
              // A new start is a new first leg: its pin no longer applies.
              onFromChange={(systemId) => setParams({ from: systemId, pin: [] }, { push: true })}
              stops={stops}
              onStopsChange={(next) =>
                setParams(
                  // Pins belong to legs by position: a new stop list drops them,
                  // but the first stop keeps the pin a Route via link made for it.
                  { stops: next, to: null, ...(stops.length > 0 ? { pin: [] } : {}) },
                  { push: true }
                )
              }
              settings={settings}
              onSettingsChange={(patch) =>
                setParams({
                  pin: [],
                  ...(patch.optimize === undefined ? {} : { opt: patch.optimize }),
                  ...(patch.returnToStart === undefined ? {} : { ret: patch.returnToStart }),
                  ...(patch.keepLastStopLast === undefined ? {} : { keep: patch.keepLastStopLast }),
                })
              }
              optimizeBlocked={state.kind === 'route' && state.unreachable}
              orderNote={orderNote}
              nameOf={nameOf}
            />
          </div>
          <div className="order-3 xl:order-none">
            <RouteRulesPanel
              preference={routeQuery.rules.preference}
              onPreferenceChange={(pref) => {
                void useDefaultRoutePreference.getState().setValue(pref);
                setParams({ pref: null });
              }}
              holeQuery={holeQuery}
              onHoleChange={(change) => {
                saveRouteHoleDefault(change);
                setParams({ [HOLE_PARAM[change.field]]: null });
              }}
              bridges={{
                bridgeQuery,
                onBridgesChange: (enabled) => {
                  void useRouteBridgesEnabled.getState().setValue(enabled);
                  setParams({ jb: null });
                },
                bridgeCount: gateRecords?.length ?? 0,
                onManageBridges: () => setBridgeDialog('search'),
              }}
            />
          </div>
        </div>
        <div className="order-2 min-w-0 space-y-4 xl:order-none">
          <RouteBody
            state={state}
            multiStop={stops.length > 1}
            nameOf={nameOf}
            killsOf={killsOf}
            avoidAction={avoidAction}
            holesState={holesState}
            pinned={params.pin.some((token) => token !== '')}
            onUse={pinLeg}
            bridges={bridges === null ? 'off' : bridges.length === 0 ? 'none' : 'known'}
            onSetUpBridges={setBridgeDialog}
          />
        </div>
      </div>
      <AvoidSystemDialog
        target={avoidTarget}
        route={state.kind === 'route' ? state : null}
        onClose={() => setAvoidTarget(null)}
      />
      {bridgeDialog !== null && (
        <AnsiblexGatesDialog
          mode={bridgeDialog}
          systems={systems}
          onClose={() => setBridgeDialog(null)}
        />
      )}
    </div>
  );
}

function RouteBody({
  state,
  multiStop,
  nameOf,
  killsOf,
  avoidAction,
  holesState,
  pinned,
  onUse,
  bridges,
  onSetUpBridges,
}: {
  state: ReturnType<typeof useRouteSafety>;
  multiStop: boolean;
  nameOf: (systemId: number) => string;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (leg: RouteSafetyLeg, row: RouteSafetyRow) => (() => void) | null;
  holesState: RouteHolesState;
  /** A leg is pinned: an incomplete route asks for the stop a Route via link left open. */
  pinned: boolean;
  onUse: (index: number, pin: string | null) => void;
} & Pick<LegWaysProps, 'bridges' | 'onSetUpBridges'>) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'incomplete':
      return (
        <EmptyState
          title={t('travel.pickTitle')}
          hint={pinned ? t('travel.ways.pickDestination') : t('travel.pickHint')}
        />
      );
    case 'same-system':
      return <EmptyState title={t('travel.sameSystemTitle')} hint={t('travel.sameSystemHint')} />;
    case 'no-route':
      return <EmptyState title={t('travel.noRouteTitle')} hint={t('travel.noRouteHint')} />;
    case 'unknown':
      return <EmptyState title={t('travel.unknownTitle')} hint={t('travel.unknownHint')} />;
    case 'loading':
      return (
        <div className="flex justify-center py-10">
          <Spinner label={t('common.loading')} />
        </div>
      );
    case 'route': {
      const { trip } = state;
      const onlyLeg = state.legs[0];
      const holeRows: HoleRowProps = {
        holesFetchedAt: holesState.kind === 'ready' ? holesState.fetchedAt : null,
        now: holesState.kind === 'ready' ? holesState.now : 0,
      };
      const ways = {
        now: holesState.kind === 'ready' ? holesState.now : 0,
        holes: holesState.kind,
        bridges,
        onSetUpBridges,
      };
      return (
        <Panel>
          <div className="space-y-3">
            {trip && (
              <SetWaypoints legs={state.legs} nameOf={nameOf}>
                <RouteFacts
                  summary={trip.summary}
                  holeJumps={trip.holeJumps}
                  bridgeJumps={trip.bridgeJumps}
                />
              </SetWaypoints>
            )}
            {trip && (
              <RouteStrip
                rows={trip.rows}
                killsOf={killsOf}
                stopIndexes={multiStop ? trip.stopIndexes : undefined}
              />
            )}
            {holesState.kind === 'loading' && (
              <p role="status" className="text-sm text-text-dim">
                {t('travel.holes.loading')}
              </p>
            )}
            {holesState.kind === 'unavailable' && (
              <p role="status" className="text-sm text-text-dim">
                {t('travel.holes.unavailable')}
              </p>
            )}
            {state.activityLoading && (
              <p role="status" className="text-sm text-text-dim">
                {t('travel.activityLoading')}
              </p>
            )}
            {state.activityUnavailable && (
              <p role="status" className="text-sm text-text-dim">
                {t('travel.activityUnavailable')}
              </p>
            )}
            {!multiStop && onlyLeg?.rows ? (
              <LegBody
                leg={onlyLeg}
                number={1}
                multiStop={false}
                nameOf={nameOf}
                onUse={(pin) => onUse(0, pin)}
                {...ways}
              >
                <RouteSystemsTable
                  rows={onlyLeg.rows}
                  killsOf={killsOf}
                  avoidAction={(row) => avoidAction(onlyLeg, row)}
                  label={t('travel.tableLabel')}
                  {...holeRows}
                />
              </LegBody>
            ) : (
              <TripLegs
                // A new order is a new itinerary: it opens on its own first leg.
                key={state.legs.map((leg) => `${leg.from}-${leg.to}`).join(',')}
                legs={state.legs}
                nameOf={nameOf}
                killsOf={killsOf}
                avoidAction={avoidAction}
                holes={holeRows}
                ways={ways}
                onUse={onUse}
              />
            )}
          </div>
        </Panel>
      );
    }
  }
}
