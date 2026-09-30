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
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import {
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterField,
  PageHeader,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import type { RouteSafetyRow, RouteSafetySummary } from '@/engine/route/routeSafety';
import { useCurrentSystem } from '@/features/route/currentSystem';
import {
  DEFAULT_ROUTE_PREFERENCE,
  ROUTE_PREFERENCE_LABEL_KEYS,
  ROUTE_PREFERENCES,
} from '@/features/route/routePreferences';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { enumParam, optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { RecentKillsCell } from './RecentKillsCell';
import { useRouteKills, type RouteKillsCell } from './useRouteKills';
import { useRouteSafety } from './useRouteSafety';

const ROUTE_PARAMS = {
  from: optionalIdParam(),
  to: optionalIdParam(),
  pref: enumParam(ROUTE_PREFERENCES, DEFAULT_ROUTE_PREFERENCE),
};

const DASH = '—';

function count(value: number | null): string {
  return value === null ? DASH : value.toLocaleString();
}

function useColumns(
  killsOf: (systemId: number) => RouteKillsCell
): DataTableColumn<RouteSafetyRow>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'system',
      header: t('travel.col.system'),
      primary: true,
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-semibold">{row.name ?? DASH}</span>
          {row.chokepoint && (
            <Tooltip content={t('travel.chokepointHint')} openOnTap>
              <span
                tabIndex={0}
                className="rounded-xs border border-warning/60 px-1.5 text-[0.6875rem] text-warning"
              >
                {t('travel.chokepoint')}
              </span>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      id: 'security',
      header: t('travel.col.security'),
      align: 'right',
      render: (row) => (row.security === null ? DASH : <SecurityStatus security={row.security} />),
    },
    {
      id: 'region',
      header: t('travel.col.region'),
      className: 'text-text-dim',
      render: (row) => row.regionName ?? DASH,
    },
    {
      id: 'jumps',
      header: t('travel.col.jumps'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => count(row.jumps),
    },
    {
      id: 'shipKills',
      header: t('travel.col.shipKills'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => count(row.shipKills),
    },
    {
      id: 'podKills',
      header: t('travel.col.podKills'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => count(row.podKills),
    },
    {
      id: 'npcKills',
      header: t('travel.col.npcKills'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => count(row.npcKills),
    },
    {
      id: 'recentKills',
      header: t('travel.col.recentKills'),
      render: (row) => <RecentKillsCell systemId={row.systemId} cell={killsOf(row.systemId)} />,
    },
  ];
}

function RouteSummary({ summary }: { summary: RouteSafetySummary }) {
  const { t } = useTranslation();
  const lines: string[] = [
    t('travel.summary.jumps', { count: summary.jumps }),
    t('travel.summary.bands', {
      highsec: summary.highsec,
      lowsec: summary.lowsec,
      nullsec: summary.nullsec,
    }),
  ];
  if (summary.lowestSecurity !== null) {
    lines.push(t('travel.summary.lowest', { security: summary.lowestSecurity.toFixed(1) }));
  }
  if (summary.shipKills !== null && summary.podKills !== null) {
    lines.push(
      t('travel.summary.kills', {
        ships: summary.shipKills.toLocaleString(),
        pods: summary.podKills.toLocaleString(),
      })
    );
  }
  lines.push(
    summary.chokepoints.length === 0
      ? t('travel.summary.noChokepoints')
      : t('travel.summary.chokepoints', { names: summary.chokepoints.join(', ') })
  );
  return (
    <ul aria-label={t('travel.summary.label')} className="flex flex-wrap gap-x-4 gap-y-1">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function PreferenceField({
  value,
  onChange,
}: {
  value: RoutePreferenceKind;
  onChange: (next: RoutePreferenceKind) => void;
}) {
  const { t } = useTranslation();
  const label = t('travel.preferenceLabel');
  return (
    <FilterField label={label} stretch={false}>
      <Select value={value} onValueChange={(next) => onChange(next as RoutePreferenceKind)}>
        <SelectTrigger aria-label={label} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROUTE_PREFERENCES.map((preference) => (
            <SelectItem key={preference} value={preference}>
              {t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
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
  const state = useRouteSafety(fromId, params.to, params.pref);
  const killsOf = useRouteKills(
    state.kind === 'route'
      ? state.rows.map((row) => ({ systemId: row.systemId, band: row.band }))
      : null
  );
  const columns = useColumns(killsOf);

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
          <PreferenceField value={params.pref} onChange={(pref) => setParams({ pref })} />
        </div>
      </Panel>
      <RouteBody state={state} columns={columns} />
    </div>
  );
}

function RouteBody({
  state,
  columns,
}: {
  state: ReturnType<typeof useRouteSafety>;
  columns: DataTableColumn<RouteSafetyRow>[];
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
            <RouteSummary summary={state.summary} />
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
            <DataTable
              columns={columns}
              rows={state.rows}
              rowKey={(row) => String(row.systemId)}
              label={t('travel.tableLabel')}
            />
          </div>
        </Panel>
      );
  }
}
