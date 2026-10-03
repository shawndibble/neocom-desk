/**
 * Travel › Route Safety (issue #2328): every system on a stargate route, with
 * its security, region, and the last hour of jumps and kills ESI reports.
 *
 * Conditions, never verdicts (decision `20260912-172628`): the page says "12
 * ship kills in the last hour" and marks a Gank Chokepoint by name. It never
 * calls a system or a route safe, unsafe or anything else — the pilot decides.
 *
 * From, To and the Route Preference live in the URL so a route can be shared.
 * The preference is never persisted (`features/route/routePreferences.ts`).
 * From falls back to the Current System when the link does not name one.
 *
 * Planner layout (issue #2472): a left column with the Route rules panel —
 * the Route Preference for this route, and the pilot's Travel Settings edited
 * in place — and the route on the right. Every middle row can Avoid its
 * system, previewing the new route before it saves.
 *
 * Itinerary (issue #2474): one panel holds the route's facts on one line,
 * the route strip (`RouteStrip`), and one-line rows with quiet stretches
 * folded (`RouteSystemsTable`).
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, EmptyState, FilterField, PageHeader, Panel, Spinner } from '@/components/ui';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import { useAvoidedSystems } from '@/features/route/avoidedSystems';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useAvoidedSystemsEnabled, useRouteQuery } from '@/features/route/routeRules';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { optionalEnumParam, optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { AvoidSystemDialog, type AvoidTarget } from './AvoidSystemDialog';
import { RouteRulesPanel } from './RouteRulesPanel';
import { RouteStrip } from './RouteStrip';
import { RouteSystemsTable } from './RouteSystemsTable';
import { routeSystemName } from './routeSystemName';
import { useRouteKills, type RouteKillsCell } from './useRouteKills';
import { useRouteSafety } from './useRouteSafety';

const ROUTE_PARAMS = {
  from: optionalIdParam(),
  to: optionalIdParam(),
  // Absent means the pilot's Travel default (Settings → Travel).
  pref: optionalEnumParam(ROUTE_PREFERENCES),
};

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
  const toName = useSystemName(params.to);
  const routeQuery = useRouteQuery(params.pref);
  const state = useRouteSafety(fromId, params.to, routeQuery);
  const killsOf = useRouteKills(
    state.kind === 'route'
      ? state.rows.map((row) => ({ systemId: row.systemId, band: row.band }))
      : null
  );
  const avoided = useAvoidedSystems((s) => s.value);
  const avoidedEnabled = useAvoidedSystemsEnabled((s) => s.value);
  const [avoidTarget, setAvoidTarget] = useState<AvoidTarget | null>(null);
  // The last drawn route's jump count, held while the route reloads, so an
  // open Avoid dialog stays mounted instead of blinking out and back.
  const routeJumps = state.kind === 'route' ? state.summary.jumps : null;
  const [lastJumps, setLastJumps] = useState<number | null>(routeJumps);
  if (routeJumps !== null && routeJumps !== lastJumps) setLastJumps(routeJumps);
  // The route's own ends cannot be avoided; a system already on an active list has nothing to add.
  const avoidAction = (row: RouteSafetyRow) =>
    row.systemId === fromId ||
    row.systemId === params.to ||
    (avoidedEnabled && avoided.includes(row.systemId))
      ? null
      : () => setAvoidTarget({ systemId: row.systemId, name: routeSystemName(row) });

  const fromTrigger =
    fromId === null
      ? t('travel.pickSystem')
      : fromIsCurrent
        ? t('travel.currentSystem', { system: fromName ?? '…' })
        : (fromName ?? '…');

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
        {/* A stack, so a panel can sit above Route rules in the same column. */}
        <div className="space-y-4">
          <RouteRulesPanel
            preference={routeQuery.rules.preference}
            onPreferenceChange={(pref) => setParams({ pref })}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="flex flex-wrap items-end gap-3">
              <FilterField label={t('travel.fromLabel')} stretch={false}>
                <SolarSystemPicker
                  value={fromId}
                  onChange={(systemId) => setParams({ from: systemId }, { push: true })}
                  ariaLabel={t('travel.changeFrom', { current: fromTrigger })}
                  triggerLabel={fromTrigger}
                />
              </FilterField>
              <FilterField label={t('travel.toLabel')} stretch={false}>
                <SolarSystemPicker
                  value={params.to}
                  onChange={(systemId) => setParams({ to: systemId }, { push: true })}
                  ariaLabel={t('travel.changeTo', {
                    current: params.to === null ? t('travel.pickSystem') : (toName ?? '…'),
                  })}
                  placeholder={t('travel.pickSystem')}
                />
              </FilterField>
            </div>
          </Panel>
          <RouteBody state={state} killsOf={killsOf} avoidAction={avoidAction} />
        </div>
      </div>
      {lastJumps !== null && fromId !== null && params.to !== null && (
        <AvoidSystemDialog
          target={avoidTarget}
          fromId={fromId}
          toId={params.to}
          rules={routeQuery.rules}
          currentJumps={lastJumps}
          onClose={() => setAvoidTarget(null)}
        />
      )}
    </div>
  );
}

function RouteBody({
  state,
  killsOf,
  avoidAction,
}: {
  state: ReturnType<typeof useRouteSafety>;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (row: RouteSafetyRow) => (() => void) | null;
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
    case 'route':
      return (
        <Panel>
          <div className="space-y-3">
            <RouteFacts summary={state.summary} />
            <RouteStrip rows={state.rows} killsOf={killsOf} />
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
            <RouteSystemsTable
              rows={state.rows}
              killsOf={killsOf}
              avoidAction={avoidAction}
              label={t('travel.tableLabel')}
            />
          </div>
        </Panel>
      );
  }
}
