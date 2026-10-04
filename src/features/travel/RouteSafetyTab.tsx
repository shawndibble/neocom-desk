/**
 * Travel › Route Safety (issue #2328): every system on a stargate route, with
 * its security, region, and the last hour of jumps and kills ESI reports.
 *
 * Conditions, never verdicts (decision `20260912-172628`): the page says "12
 * ship kills in the last hour" and marks a Gank Chokepoint by name. It never
 * calls a system or a route safe, unsafe or anything else — the pilot decides.
 *
 * From, the Stops and the Route Preference live in the URL so a route can be
 * shared. The preference is never persisted
 * (`features/route/routePreferences.ts`). From falls back to the Current
 * System when the link does not name one.
 *
 * Planner layout (issue #2472): a left column with the Route rules panel —
 * the Route Preference for this route, and the pilot's Travel Settings edited
 * in place — and the route on the right. Every middle row can Avoid its
 * system, previewing the new route before it saves.
 *
 * Itinerary (issue #2474): one panel holds the route's facts on one line,
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
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import { WORMHOLE_SHIP_SIZES, type TheraConnection } from '@/engine/route/theraConnections';
import { MAX_STOPS } from '@/engine/route/tripPlan';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useCurrentSystem } from '@/features/route/currentSystem';
import {
  MAX_ROUTE_HOLE_MIN_LIFE,
  MIN_ROUTE_HOLE_MIN_LIFE,
  ROUTE_HOLE_HUBS,
  useRouteHoleHubs,
  useRouteHoleMinLife,
  useRouteHoleQuery,
  useRouteHolesEnabled,
  useRouteHoleShipSize,
} from '@/features/route/routeHoleSettings';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useAvoidedSystemsEnabled, useRouteQuery } from '@/features/route/routeRules';
import { useSolarSystemIndex, useSystemName } from '@/features/route/useSolarSystems';
import {
  boolParam,
  optionalBoolParam,
  optionalEnumParam,
  optionalIdParam,
  optionalIntParam,
  orderedIdListParam,
} from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { AvoidSystemDialog, type AvoidTarget } from './AvoidSystemDialog';
import { RouteRulesPanel, type RouteHoleChange } from './RouteRulesPanel';
import { RouteStrip } from './RouteStrip';
import { RouteSystemsTable, type HoleRowProps } from './RouteSystemsTable';
import { routeSystemName } from './routeSystemName';
import { SetWaypoints } from './SetWaypoints';
import { StopsPanel, type StopOrderSettings } from './StopsPanel';
import { TripLegs } from './TripLegs';
import { useRouteHoles, type RouteHolesState } from './useRouteHoles';
import { useRouteKills, type RouteKillsCell } from './useRouteKills';
import { useRouteSafety, type RouteSafetyLeg } from './useRouteSafety';

const ROUTE_PARAMS = {
  from: optionalIdParam(),
  // The stops in the order typed. `to` is the single-stop link from before
  // stops, still read so an old link opens; nothing writes it any more.
  stops: orderedIdListParam(),
  to: optionalIdParam(),
  opt: boolParam(),
  ret: boolParam(),
  keep: boolParam(),
  // Absent means the pilot's Travel default (Settings → Travel).
  pref: optionalEnumParam(ROUTE_PREFERENCES),
  // Route Safety's wormhole settings; absent means the page's saved default.
  wh: optionalBoolParam(),
  whsize: optionalEnumParam(WORMHOLE_SHIP_SIZES),
  whlife: optionalIntParam({ min: MIN_ROUTE_HOLE_MIN_LIFE, max: MAX_ROUTE_HOLE_MIN_LIFE }),
  whhub: optionalEnumParam(ROUTE_HOLE_HUBS),
};

/** The link parameter overriding each wormhole setting. */
const HOLE_PARAM = {
  enabled: 'wh',
  shipSize: 'whsize',
  minLifeHours: 'whlife',
  hubs: 'whhub',
} as const;

/** Saves a wormhole setting as the page's default. */
function saveHoleDefault(change: RouteHoleChange): void {
  switch (change.field) {
    case 'enabled':
      void useRouteHolesEnabled.getState().setValue(change.value);
      return;
    case 'shipSize':
      void useRouteHoleShipSize.getState().setValue(change.value);
      return;
    case 'minLifeHours':
      void useRouteHoleMinLife.getState().setValue(change.value);
      return;
    case 'hubs':
      void useRouteHoleHubs.getState().setValue(change.value);
  }
}

const NO_HOLES: readonly TheraConnection[] = [];

/** The stops a link names: `stops`, else a legacy `to`, each once, at most `MAX_STOPS`. */
function stopsFromLink(stops: readonly number[], to: number | null): number[] {
  const named = stops.length > 0 ? stops : to === null ? [] : [to];
  return [...new Set(named)].slice(0, MAX_STOPS);
}

/** The leg an Avoid was asked from: its preview re-plans that leg alone. */
interface AvoidLeg {
  from: number;
  to: number;
  jumps: number;
}

/**
 * The route's facts on one line: jumps (by gate · through wormholes, when a
 * hole is flown) · bands · lowest · last hour's kills · chokepoints.
 */
function RouteFacts({ summary, holeJumps }: { summary: RouteSafetySummary; holeJumps: number }) {
  const { t } = useTranslation();
  const facts: string[] = [
    t('travel.summary.jumps', { count: summary.jumps }),
    ...(holeJumps === 0
      ? []
      : [
          t('travel.summary.byGate', { count: summary.jumps - holeJumps }),
          t('travel.summary.throughHoles', { count: holeJumps }),
        ]),
    t('travel.summary.bands', {
      highsec: summary.highsec,
      lowsec: summary.lowsec,
      nullsec: summary.nullsec,
    }),
  ];
  if (summary.lowestSecurity !== null) {
    facts.push(t('travel.summary.lowest', { security: summary.lowestSecurity.toFixed(1) }));
  }
  if (summary.shipKills !== null && summary.podKills !== null) {
    facts.push(
      t('travel.summary.kills', {
        ships: summary.shipKills.toLocaleString(),
        pods: summary.podKills.toLocaleString(),
      })
    );
  }
  facts.push(
    summary.chokepoints.length === 0
      ? t('travel.summary.noChokepoints')
      : t('travel.summary.chokepoints', { names: summary.chokepoints.join(', ') })
  );
  return (
    <ul aria-label={t('travel.summary.label')} className="flex flex-wrap gap-x-2 gap-y-1">
      {facts.map((fact, index) => (
        <li key={fact} className="inline-flex gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
          )}
          <span>{fact}</span>
        </li>
      ))}
    </ul>
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
  const state = useRouteSafety(
    fromId,
    stops,
    {
      optimize: optimizing,
      returnToStart: optimizing && settings.returnToStart,
      keepLastStopLast: optimizing && settings.keepLastStopLast,
    },
    routeQuery,
    holes
  );
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
  // The leg the last Avoid was asked from, kept after the dialog closes so it
  // stays mounted rather than blinking out and back while the route reloads.
  const [avoidLeg, setAvoidLeg] = useState<AvoidLeg | null>(null);
  // The trip's own start and stops cannot be avoided; a system already on an
  // active list has nothing to add.
  const avoidAction = (leg: RouteSafetyLeg, row: RouteSafetyRow) =>
    row.systemId === fromId ||
    stops.includes(row.systemId) ||
    (avoidedEnabled && avoided.includes(row.systemId))
      ? null
      : () => {
          setAvoidLeg({ from: leg.from, to: leg.to, jumps: leg.summary?.jumps ?? 0 });
          setAvoidTarget({ systemId: row.systemId, name: routeSystemName(row) });
        };

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
        <div className="contents space-y-4 xl:block">
          <div className="order-1 xl:order-none">
            <StopsPanel
              fromId={fromId}
              fromName={fromId === null ? fromTrigger : nameOf(fromId)}
              fromTrigger={fromTrigger}
              onFromChange={(systemId) => setParams({ from: systemId }, { push: true })}
              stops={stops}
              onStopsChange={(next) => setParams({ stops: next, to: null }, { push: true })}
              settings={settings}
              onSettingsChange={(patch) =>
                setParams({
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
              onPreferenceChange={(pref) => setParams({ pref })}
              holeQuery={holeQuery}
              onHoleChange={(change) => {
                saveHoleDefault(change);
                setParams({ [HOLE_PARAM[change.field]]: null });
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
          />
        </div>
      </div>
      {avoidLeg !== null && (
        <AvoidSystemDialog
          target={avoidTarget}
          fromId={avoidLeg.from}
          toId={avoidLeg.to}
          rules={routeQuery.rules}
          currentJumps={avoidLeg.jumps}
          extras={state.kind === 'route' ? state.network : undefined}
          extrasKey={state.kind === 'route' ? state.networkKey : ''}
          onClose={() => setAvoidTarget(null)}
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
}: {
  state: ReturnType<typeof useRouteSafety>;
  multiStop: boolean;
  nameOf: (systemId: number) => string;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (leg: RouteSafetyLeg, row: RouteSafetyRow) => (() => void) | null;
  holesState: RouteHolesState;
}) {
  const { t } = useTranslation();
  switch (state.kind) {
    case 'incomplete':
      return <EmptyState title={t('travel.pickTitle')} hint={t('travel.pickHint')} />;
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
        holeAt: state.holeAt,
        holesFetchedAt: holesState.kind === 'ready' ? holesState.fetchedAt : null,
        now: holesState.kind === 'ready' ? holesState.now : 0,
      };
      return (
        <Panel>
          <div className="space-y-3">
            {trip && (
              <SetWaypoints legs={state.legs} nameOf={nameOf}>
                <RouteFacts summary={trip.summary} holeJumps={trip.holeJumps} />
              </SetWaypoints>
            )}
            {trip && (
              <RouteStrip
                rows={trip.rows}
                killsOf={killsOf}
                stopIndexes={multiStop ? trip.stopIndexes : undefined}
                holeAt={state.holeAt}
              />
            )}
            {holesState.kind === 'loading' && (
              <p role="status" className="text-text-dim">
                {t('travel.holes.loading')}
              </p>
            )}
            {holesState.kind === 'unavailable' && (
              <p role="status" className="text-text-dim">
                {t('travel.holes.unavailable')}
              </p>
            )}
            {state.activityLoading && (
              <p role="status" className="text-text-dim">
                {t('travel.activityLoading')}
              </p>
            )}
            {state.activityUnavailable && (
              <p role="status" className="text-text-dim">
                {t('travel.activityUnavailable')}
              </p>
            )}
            {!multiStop && onlyLeg?.rows ? (
              <RouteSystemsTable
                rows={onlyLeg.rows}
                killsOf={killsOf}
                avoidAction={(row) => avoidAction(onlyLeg, row)}
                label={t('travel.tableLabel')}
                {...holeRows}
              />
            ) : (
              <TripLegs
                // A new order is a new itinerary: it opens on its own first leg.
                key={state.legs.map((leg) => `${leg.from}-${leg.to}`).join(',')}
                legs={state.legs}
                nameOf={nameOf}
                killsOf={killsOf}
                avoidAction={avoidAction}
                holes={holeRows}
              />
            )}
          </div>
        </Panel>
      );
    }
  }
}
