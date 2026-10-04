/**
 * Travel › Thera / Turnur (issues #2330, #2499): the current wormhole
 * connections out of the two public hubs, from EVE-Scout, as a slim table of
 * open holes with each exit's jump distance from a chosen origin.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a row gives the
 * exit's security, the hole's size and remaining life; the pilot decides.
 *
 * Origin, Route Preference, Hub, Exit (`space`) and Fits live in the URL. The
 * origin falls back to the Current System when the link does not name one; an
 * unknown `space` value (older links carried `all`) falls back to K-space.
 *
 * Under K-space, holes into J-space have no gate route from anywhere, so they
 * fold into a group under the table instead of sinking to its bottom.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, Disclosure, EmptyState, PageHeader, Panel, Spinner } from '@/components/ui';
import {
  countTheraConnectionsByHub,
  filterTheraConnections,
  longestLifeFirst,
  THERA_EXITS,
  type TheraConnectionFilter,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useRouteQuery } from '@/features/route/routeRules';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { cx } from '@/lib/cx';
import { enumParam, optionalEnumParam, optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { TheraFilters } from './TheraFilters';
import { HUB_OPTIONS, SIZE_OPTIONS } from './theraOptions';
import { TheraTable } from './TheraTable';
import { useTheraConnections, type TheraConnectionsState } from './useTheraConnections';

const THERA_PARAMS = {
  origin: optionalIdParam(),
  // Absent means the pilot's Travel default (Settings → Travel).
  pref: optionalEnumParam(ROUTE_PREFERENCES),
  hub: enumParam(HUB_OPTIONS, 'all'),
  space: enumParam(THERA_EXITS, 'kspace'),
  size: enumParam(SIZE_OPTIONS, 'any'),
};

export function TheraTab({ tabBar }: { tabBar: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(THERA_PARAMS);
  const current = useCurrentSystem();
  const originId = params.origin ?? current.systemId;
  const originIsCurrent = params.origin === null && current.systemId !== null;
  const originName = useSystemName(originId);
  const routeQuery = useRouteQuery(params.pref);
  const state = useTheraConnections(originId, routeQuery);
  const filter: TheraConnectionFilter = {
    hub: params.hub,
    shipSize: params.size,
    exit: params.space,
  };
  const hubCounts =
    state.kind === 'ready'
      ? countTheraConnectionsByHub(state.rows, filter)
      : countTheraConnectionsByHub([], filter);

  const originTrigger =
    originId === null
      ? t('travel.pickSystem')
      : originIsCurrent
        ? t('travel.currentSystem', { system: originName ?? '…' })
        : (originName ?? '…');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('travel.title')}
        meta={
          state.kind === 'ready' ? (
            <DataAgeBadge date={state.fetchedAt} note={t('travel.thera.dataAgeNote')} />
          ) : undefined
        }
      />
      {tabBar}
      <Panel>
        <TheraFilters
          origin={
            <SolarSystemPicker
              value={originId}
              onChange={(systemId) => setParams({ origin: systemId }, { push: true })}
              ariaLabel={t('travel.thera.changeOrigin', { current: originTrigger })}
              triggerLabel={originTrigger}
            />
          }
          values={{
            hub: params.hub,
            space: params.space,
            size: params.size,
            pref: routeQuery.rules.preference,
          }}
          hubCounts={hubCounts}
          prefIsDefault={params.pref === null}
          onChange={(next) => setParams(next)}
        />
      </Panel>
      <TheraBody
        state={state}
        filter={filter}
        hasOrigin={originId !== null}
        originName={originName}
      />
    </div>
  );
}

function TheraBody({
  state,
  filter,
  hasOrigin,
  originName,
}: {
  state: TheraConnectionsState;
  filter: TheraConnectionFilter;
  hasOrigin: boolean;
  originName: string | null;
}) {
  const { t } = useTranslation();
  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <EmptyState
        title={t('travel.thera.unavailableTitle')}
        hint={t('travel.thera.unavailableHint')}
      />
    );
  }
  // Longest-lived first: the table's jumps sort is stable, so ties (every
  // J-space hole) keep this order.
  const ordered = longestLifeFirst(state.rows);
  const rows = filterTheraConnections(ordered, filter);
  // Under K-space the holes into J-space fold under the table; any other
  // exit filter shows exactly what it names.
  const jspace =
    filter.exit === 'kspace'
      ? filterTheraConnections(ordered, { ...filter, exit: 'wormhole' })
      : [];
  // One live region, always mounted, so a change of message is announced.
  const jumpsNote = !hasOrigin
    ? t('travel.thera.noOrigin')
    : state.distancesLoading
      ? t('travel.thera.jumpsLoading')
      : state.originUngated
        ? t('travel.thera.originUngated', { system: originName ?? '…' })
        : state.rows.some((row) => row.jumps.kind === 'unknown')
          ? t('travel.thera.jumpsUnknown')
          : '';
  const listed = state.rows.length > 0;
  return (
    <Panel>
      <div className="space-y-3">
        <p role="status" className={cx('text-text-dim', jumpsNote === '' && 'sr-only')}>
          {jumpsNote}
        </p>
        {rows.length > 0 ? (
          <TheraTable
            rows={rows}
            label={
              filter.exit === 'wormhole'
                ? t('travel.thera.jspaceTableLabel')
                : t('travel.thera.tableLabel')
            }
          />
        ) : (
          <EmptyState
            title={
              !listed
                ? t('travel.thera.emptyTitle')
                : jspace.length > 0
                  ? t('travel.thera.noKspaceMatchTitle')
                  : t('travel.thera.noMatchTitle')
            }
            hint={listed ? t('travel.thera.noMatchHint') : t('travel.thera.emptyHint')}
          />
        )}
        {jspace.length > 0 && <JspaceGroup rows={jspace} />}
      </div>
    </Panel>
  );
}

/** Holes into J-space under the K-space table: collapsed, and the same rows when opened. */
function JspaceGroup({ rows }: { rows: readonly TheraConnectionRow[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure
      label={t('travel.thera.jspaceGroup', { count: rows.length })}
      expanded={expanded}
      onToggle={() => setExpanded((was) => !was)}
      className="rounded-xs border border-line"
    >
      <TheraTable rows={rows} label={t('travel.thera.jspaceTableLabel')} />
    </Disclosure>
  );
}
