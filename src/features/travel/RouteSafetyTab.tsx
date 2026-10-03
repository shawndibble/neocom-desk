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
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import { MAX_STOPS } from '@/engine/route/tripPlan';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useAvoidedSystemsEnabled, useRouteQuery } from '@/features/route/routeRules';
import { useSolarSystemIndex, useSystemName } from '@/features/route/useSolarSystems';
import { boolParam, optionalEnumParam, optionalIdParam, orderedIdListParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { AvoidSystemDialog, type AvoidTarget } from './AvoidSystemDialog';
import { RouteRulesPanel } from './RouteRulesPanel';
import { RouteStrip } from './RouteStrip';
import { RouteSystemsTable } from './RouteSystemsTable';
import { routeSystemName } from './routeSystemName';
import { StopsPanel, type StopOrderSettings } from './StopsPanel';
import { TripLegs } from './TripLegs';
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
};

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

/** The route's facts on one line: jumps · bands · lowest · last hour's kills · chokepoints. */
function RouteFacts({ summary }: { summary: RouteSafetySummary }) {
  const { t } = useTranslation();
  const facts: string[] = [
    t('travel.summary.jumps', { count: summary.jumps }),
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
  const state = useRouteSafety(
    fromId,
    stops,
    {
      optimize: optimizing,
      returnToStart: optimizing && settings.returnToStart,
      keepLastStopLast: optimizing && settings.keepLastStopLast,
    },
    routeQuery
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
          order: state.reordered.stops.map(nameOf).join(' → '),
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
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <StopsPanel
            fromId={fromId}
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
          />
          <RouteRulesPanel
            preference={routeQuery.rules.preference}
            onPreferenceChange={(pref) => setParams({ pref })}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <RouteBody
            state={state}
            multiStop={stops.length > 1}
            nameOf={nameOf}
            killsOf={killsOf}
            avoidAction={avoidAction}
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
}: {
  state: ReturnType<typeof useRouteSafety>;
  multiStop: boolean;
  nameOf: (systemId: number) => string;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (leg: RouteSafetyLeg, row: RouteSafetyRow) => (() => void) | null;
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
      return (
        <Panel>
          <div className="space-y-3">
            {trip && <RouteFacts summary={trip.summary} />}
            {trip && (
              <RouteStrip
                rows={trip.rows}
                killsOf={killsOf}
                stopIndexes={multiStop ? trip.stopIndexes : undefined}
              />
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
              />
            ) : (
              <TripLegs
                legs={state.legs}
                nameOf={nameOf}
                killsOf={killsOf}
                avoidAction={avoidAction}
              />
            )}
          </div>
        </Panel>
      );
    }
  }
}
