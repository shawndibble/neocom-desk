import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  DataAgeBadge,
  EmptyState,
  LiveNote,
  PageHeader,
  Panel,
  Spinner,
  StatChip,
  StatChips,
  TabPanel,
} from '@/components/ui';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import type { TheraConnection } from '@/engine/route/theraConnections';
import { parseStopRefs, serializeStopRefs, type StopRef } from '@/engine/route/stopRef';
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
import {
  useRouteJump,
  useRouteJumpRange,
  useRouteJumpsEnabled,
} from '@/features/route/routeJumpSettings';
import type { JumpWayFacts } from '@/engine/route/jumpLegs';
import { formatDuration } from '@/lib/duration';
import { routeMassCheck } from '@/engine/route/jumpMass';
import { useRouteShipMass } from '@/features/route/routeShip';
import { useSolarSystemIndex, useSystemName } from '@/features/route/useSolarSystems';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useUrlParams } from '@/lib/useUrlState';
import { AnsiblexGatesDialog, type AnsiblexDialogMode } from './AnsiblexGatesDialog';
import { useAnsiblexGates } from '@/features/route/ansiblexGates';
import { AvoidSystemDialog, type AvoidTarget } from './AvoidSystemDialog';
import { LegBody, type LegWaysProps } from './LegWays';
import { IncursionsPanel, type RouteAction } from './IncursionsPanel';
import { PreferenceCards } from './PreferenceCards';
import { QuickPicks } from './QuickPicks';
import { RouteRulesPanel } from './RouteRulesPanel';
import { RouteSkeleton } from './RouteSkeleton';
import { TheraModal } from './TheraModal';
import { RouteStrip } from './RouteStrip';
import { TripTimeLine } from './TripTimeLine';
import { RouteSystemsTable, type HoleRowProps } from './RouteSystemsTable';
import { pinFirstLeg, ROUTE_PARAMS } from '@/features/route/routeSafetyLink';
import { routeSystemName } from './routeSystemName';
import { SetWaypoints } from './SetWaypoints';
import { StopsPanel, type StopOrderSettings } from './StopsPanel';
import { useStationLabels } from './useStationLabels';
import { TripLegs } from './TripLegs';
import { useRouteHoles, type RouteHolesState } from '@/features/route/useRouteHoles';
import { sameSavedRoute, useSavedRoute } from './savedRoute';
import { useRouteKills, type RouteKillsCell } from './useRouteKills';
import { usePreferenceRoutes } from './usePreferenceRoutes';
import { useRouteSafety, type RouteSafetyLeg } from './useRouteSafety';
import type { TravelTabProps } from './travelTab';
import { formatNumber } from '@/lib/numberLocale';

const HOLE_PARAM = {
  enabled: 'wh',
  shipSize: 'whsize',
  minLifeHours: 'whlife',
  hubs: 'whhub',
} as const;

const NO_HOLES: readonly TheraConnection[] = [];

function stopsFromLink(stops: readonly StopRef[], to: number | null): StopRef[] {
  const named = stops.length > 0 ? stops : to === null ? [] : [{ systemId: to, stationId: null }];
  const seen = new Set<number>();
  const unique: StopRef[] = [];
  for (const stop of named) {
    if (seen.has(stop.systemId)) continue;
    seen.add(stop.systemId);
    unique.push(stop);
  }
  return unique.slice(0, MAX_STOPS);
}

function RouteFacts({
  summary,
  holeJumps,
  bridgeJumps,
  driveJumps,
  jump,
  massBlocked,
  shipName,
}: {
  summary: RouteSafetySummary;
  holeJumps: number;
  bridgeJumps: number;
  driveJumps: number;
  jump: JumpWayFacts | null;
  massBlocked: number;
  shipName: string | null;
}) {
  const { t } = useTranslation();
  const flownOtherwise = holeJumps > 0 || bridgeJumps > 0 || driveJumps > 0;
  return (
    <div role="group" aria-label={t('travel.summary.label')} className="min-w-0">
      <StatChips>
        <StatChip label={t('travel.summary.jumpsLabel')} value={summary.jumps} />
        {flownOtherwise && (
          <StatChip
            label={t('travel.summary.byGateLabel')}
            value={summary.jumps - holeJumps - bridgeJumps - driveJumps}
          />
        )}
        {driveJumps > 0 && <StatChip label={t('travel.summary.driveLabel')} value={driveJumps} />}
        {jump && (
          <StatChip
            label={t('travel.summary.fuelLabel')}
            value={t('travel.jumpDrive.fuelValue', {
              count: jump.fuel,
              fuel: formatNumber(jump.fuel),
            })}
          />
        )}
        {jump && (
          <StatChip
            label={t('travel.summary.arriveLabel')}
            value={t('travel.jumpDrive.arriveValue', {
              time: formatDuration(Math.round(jump.arriveMinutes) * 60),
            })}
          />
        )}
        {holeJumps > 0 && <StatChip label={t('travel.summary.holesLabel')} value={holeJumps} />}
        {bridgeJumps > 0 && (
          <StatChip label={t('travel.summary.bridgesLabel')} value={bridgeJumps} />
        )}
        {flownOtherwise && shipName !== null && (
          <StatChip label={t('travel.summary.shipLabel')} value={shipName} />
        )}
        {massBlocked > 0 && (
          <StatChip
            label={t('travel.summary.massLabel')}
            value={t('travel.summary.massValue', { count: massBlocked })}
            tone="warning"
          />
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
              ships: formatNumber(summary.shipKills),
              pods: formatNumber(summary.podKills),
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

export function RouteSafetyTab({ tabBar, tabsId }: TravelTabProps) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(ROUTE_PARAMS);
  const current = useCurrentSystem();
  const fromId = params.from ?? current.systemId;
  const fromIsGame = params.from === null && current.source === 'game';
  const fromIsPicked = params.from === null && current.source === 'picked';
  const fromName = useSystemName(fromId);
  const systems = useSolarSystemIndex();
  const refsKey = serializeStopRefs(stopsFromLink(params.stops, params.to)) ?? '';
  const stopRefs = useMemo(() => parseStopRefs(refsKey), [refsKey]);
  const stopsKey = stopRefs.map((stop) => stop.systemId).join(',');
  const stops = useMemo(() => (stopsKey === '' ? [] : stopsKey.split(',').map(Number)), [stopsKey]);
  const stationIds = useMemo(
    () => stopRefs.flatMap((stop) => (stop.stationId === null ? [] : [stop.stationId])),
    [stopRefs]
  );
  const { labels: stationLabels, remember: rememberStation } = useStationLabels(stationIds);
  const settings: StopOrderSettings = {
    optimize: params.opt,
    returnToStart: params.ret,
    keepLastStopLast: params.keep,
  };
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
  const bridges =
    bridgeQuery.enabled && bridgeQuery.hydrated && gateRecords !== undefined ? gateRecords : null;
  const [bridgeDialog, setBridgeDialog] = useState<AnsiblexDialogMode | null>(null);
  const [theraOpen, setTheraOpen] = useState(false);
  const jumpDrive = useRouteJump();
  const jumpEnabled = useRouteJumpsEnabled((s) => s.value);
  const jumpRange = useRouteJumpRange((s) => s.value);
  const state = useRouteSafety({
    fromId,
    stops,
    tripOptions: {
      optimize: optimizing,
      returnToStart: optimizing && settings.returnToStart,
      keepLastStopLast: optimizing && settings.keepLastStopLast,
    },
    route: {
      ...routeQuery,
      hydrated:
        routeQuery.hydrated && bridgeQuery.hydrated && gateRecords !== undefined && jumpDrive.ready,
    },
    holes,
    pins: params.pin,
    listed,
    bridges,
    jump: jumpDrive.setup,
  });
  const preferenceCardList = usePreferenceRoutes(state, routeQuery.rules.preference);
  const takenSystems = useMemo(
    () => new Set(fromId === null ? stops : [fromId, ...stops]),
    [fromId, stops]
  );
  const pinLeg = (index: number, pin: string | null) => {
    const next = [...params.pin];
    while (next.length <= index) next.push('');
    next[index] = pin ?? '';
    setParams({ pin: next }, { push: true });
  };
  const routeSystems = useMemo(() => {
    if (state.kind !== 'route') return null;
    const seen = new Map<number, RouteSafetyRow>();
    for (const leg of state.legs) {
      for (const row of leg.rows ?? []) if (!seen.has(row.systemId)) seen.set(row.systemId, row);
    }
    return [...seen.values()].map((row) => ({ systemId: row.systemId, band: row.band }));
  }, [state]);
  const killsOf = useRouteKills(routeSystems);
  useEffect(() => {
    if (routeSystems === null || fromId === null || stops.length === 0) return;
    const next = { fromId, stops, systems: routeSystems.map((system) => system.systemId) };
    void (async () => {
      await useSavedRoute.getState().hydrate();
      if (!sameSavedRoute(useSavedRoute.getState().value, next)) {
        await useSavedRoute.getState().setValue(next);
      }
    })();
  }, [routeSystems, fromId, stops]);
  const avoided = useAvoidedSystems((s) => s.value);
  const avoidedEnabled = useAvoidedSystemsEnabled((s) => s.value);
  const [avoidTarget, setAvoidTarget] = useState<AvoidTarget | null>(null);
  const avoidAction = (_leg: RouteSafetyLeg, row: RouteSafetyRow) =>
    row.systemId === fromId ||
    stops.includes(row.systemId) ||
    (avoidedEnabled && avoided.includes(row.systemId))
      ? null
      : () => setAvoidTarget({ systemId: row.systemId, name: routeSystemName(row) });

  const focusAfterCommit = useFocusAfterCommit();
  const focusStopsOnChange = useRef(false);
  const incursionRouteAction = (systemId: number): RouteAction =>
    systemId === fromId || stops.includes(systemId)
      ? 'on-route'
      : stops.length >= MAX_STOPS
        ? 'full'
        : 'add';
  const routeToIncursion = (systemId: number) => {
    if (incursionRouteAction(systemId) !== 'add') return;
    setParams(
      {
        stops: [...stopRefs, { systemId, stationId: null }],
        to: null,
        ...(stops.length > 0 ? { pin: [] } : {}),
      },
      { push: true }
    );
    focusStopsOnChange.current = true;
  };
  useEffect(() => {
    if (!focusStopsOnChange.current) return;
    focusStopsOnChange.current = false;
    focusAfterCommit(
      () => document.querySelector<HTMLElement>('[data-stops-list]'),
      () => document.querySelector<HTMLElement>('[data-stops-panel]')
    );
  }, [stopsKey, focusAfterCommit]);

  const fromTrigger =
    fromId === null
      ? t('travel.pickSystem')
      : fromIsGame
        ? t('travel.currentSystem', { system: fromName ?? '…' })
        : fromIsPicked
          ? t('travel.pickedSystem', { system: fromName ?? '…' })
          : (fromName ?? '…');
  const stationOf = new Map(stopRefs.map((stop) => [stop.systemId, stop.stationId]));
  const nameOf = (systemId: number) => {
    const stationId = stationOf.get(systemId);
    const station = stationId == null ? undefined : stationLabels.get(stationId);
    return station ?? systems?.get(systemId)?.name ?? t('travel.stops.unnamed', { id: systemId });
  };
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
      <TabPanel tabsId={tabsId} tabId="route" className="space-y-4">
        <div className="focus:outline-none" data-stops-panel>
          <StopsPanel
            fromId={fromId}
            fromName={fromId === null ? fromTrigger : nameOf(fromId)}
            fromTrigger={fromTrigger}
            onFromChange={(systemId) => setParams({ from: systemId, pin: [] }, { push: true })}
            onFromReset={
              params.from !== null || current.source === 'picked'
                ? () => {
                    current.clearPick();
                    setParams({ from: null, pin: [] }, { push: true });
                  }
                : undefined
            }
            stops={stopRefs}
            onStopsChange={(next, picked) => {
              if (picked) rememberStation(picked.id, picked.name);
              setParams(
                { stops: next, to: null, ...(stops.length > 0 ? { pin: [] } : {}) },
                { push: true }
              );
              if (stops.length === 0 && next.length > 0) focusStopsOnChange.current = true;
            }}
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
            quickPicks={
              <QuickPicks
                current={current}
                taken={takenSystems}
                onPick={(systemId) => {
                  setParams({ stops: [{ systemId, stationId: null }], to: null }, { push: true });
                  focusStopsOnChange.current = true;
                }}
              />
            }
          />
        </div>
        <PreferenceCards
          cards={preferenceCardList}
          onSelect={(pref) => {
            void useDefaultRoutePreference.getState().setValue(pref);
            setParams({ pref: null });
          }}
        />
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
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
              jumpUnavailable={jumpDrive.unavailable}
            />
          </div>
          <div className="min-w-0 space-y-4">
            <RouteRulesPanel
              preference={routeQuery.rules.preference}
              onPreferenceChange={(pref) => {
                void useDefaultRoutePreference.getState().setValue(pref);
                setParams({ pref: null });
              }}
              holeQuery={holeQuery}
              onBrowseWormholes={() => setTheraOpen(true)}
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
              jump={{
                enabled: jumpEnabled,
                onEnabledChange: (enabled) =>
                  void useRouteJumpsEnabled.getState().setValue(enabled),
                range: jumpRange,
                onRangeChange: (range) => void useRouteJumpRange.getState().setValue(range),
                unavailable: jumpDrive.unavailable,
              }}
            />
            <IncursionsPanel
              current={current}
              routeAction={incursionRouteAction}
              onRoute={routeToIncursion}
            />
          </div>
        </div>
        <AvoidSystemDialog
          target={avoidTarget}
          route={state.kind === 'route' ? state : null}
          onClose={() => setAvoidTarget(null)}
        />
        <TheraModal
          open={theraOpen}
          onClose={() => setTheraOpen(false)}
          originId={fromId}
          routeQuery={routeQuery}
          onUse={(holeId) => {
            setParams({ wh: true, pin: pinFirstLeg(params.pin, holeId) }, { push: true });
            setTheraOpen(false);
          }}
        />
        {bridgeDialog !== null && (
          <AnsiblexGatesDialog
            mode={bridgeDialog}
            systems={systems}
            onClose={() => setBridgeDialog(null)}
          />
        )}
      </TabPanel>
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
  jumpUnavailable,
}: {
  state: ReturnType<typeof useRouteSafety>;
  jumpUnavailable: boolean;
  multiStop: boolean;
  nameOf: (systemId: number) => string;
  killsOf: (systemId: number) => RouteKillsCell;
  avoidAction: (leg: RouteSafetyLeg, row: RouteSafetyRow) => (() => void) | null;
  holesState: RouteHolesState;
  pinned: boolean;
  onUse: (index: number, pin: string | null) => void;
} & Pick<LegWaysProps, 'bridges' | 'onSetUpBridges'>) {
  const { t } = useTranslation();
  const mass = useRouteShipMass();
  switch (state.kind) {
    case 'incomplete':
      return (
        <RouteSkeleton hint={pinned ? t('travel.ways.pickDestination') : t('travel.pickHint')} />
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
      const check = trip
        ? routeMassCheck(trip.rows, mass.ship?.massKg ?? null, mass.holeTable)
        : null;
      const massBlocked = check ? check.blocked + check.bridgeBlocked : 0;
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
            {jumpUnavailable && (
              <p className="text-xs text-warning">{t('travel.jumpDrive.unavailable')}</p>
            )}
            {trip && (
              <SetWaypoints legs={state.legs} nameOf={nameOf}>
                <RouteFacts
                  summary={trip.summary}
                  holeJumps={trip.holeJumps}
                  bridgeJumps={trip.bridgeJumps}
                  driveJumps={trip.driveJumps}
                  jump={trip.jump}
                  massBlocked={massBlocked}
                  shipName={mass.ship?.name ?? null}
                />
              </SetWaypoints>
            )}
            {trip && <TripTimeLine trip={trip} />}
            {trip && (
              <RouteStrip
                rows={trip.rows}
                killsOf={killsOf}
                stopIndexes={multiStop ? trip.stopIndexes : undefined}
              />
            )}
            {holesState.kind === 'loading' && (
              <LiveNote className="text-sm text-text-dim">{t('travel.holes.loading')}</LiveNote>
            )}
            {holesState.kind === 'unavailable' && (
              <LiveNote className="text-sm text-text-dim">{t('travel.holes.unavailable')}</LiveNote>
            )}
            {state.activityLoading && (
              <LiveNote className="text-sm text-text-dim">{t('travel.activityLoading')}</LiveNote>
            )}
            {state.activityUnavailable && (
              <LiveNote className="text-sm text-text-dim">
                {t('travel.activityUnavailable')}
              </LiveNote>
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
