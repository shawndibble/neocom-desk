/**
 * Travel › Thera / Turnur (issue #2330): the current wormhole connections out
 * of the two public hubs, from EVE-Scout, with each exit's jump distance from
 * a chosen origin.
 *
 * Conditions, never verdicts (decision `20260912-172628`): a row gives the
 * exit's security, the hole's size and remaining life; the pilot decides.
 *
 * Origin, Route Preference and the three filters live in the URL. The origin
 * falls back to the Current System when the link does not name one.
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
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import {
  filterTheraConnections,
  jumpsSortValue,
  shipSizeRank,
  THERA_HUBS,
  WORMHOLE_SHIP_SIZES,
  type TheraConnectionFilter,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { SPACE_KINDS } from '@/engine/space';
import { useCurrentSystem } from '@/features/route/currentSystem';
import { DEFAULT_ROUTE_PREFERENCE, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { SolarSystemPicker } from '@/features/route/SolarSystemPicker';
import { useSystemName } from '@/features/route/useSolarSystems';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { enumParam, optionalIdParam } from '@/lib/urlState';
import { useUrlParams } from '@/lib/useUrlState';
import { OptionField, PreferenceField } from './PreferenceField';
import { useTheraConnections, type TheraConnectionsState } from './useTheraConnections';

const HUB_OPTIONS = ['all', ...THERA_HUBS] as const;
const SPACE_OPTIONS = ['all', ...SPACE_KINDS] as const;
const SIZE_OPTIONS = ['any', ...WORMHOLE_SHIP_SIZES] as const;

const THERA_PARAMS = {
  origin: optionalIdParam(),
  pref: enumParam(ROUTE_PREFERENCES, DEFAULT_ROUTE_PREFERENCE),
  hub: enumParam(HUB_OPTIONS, 'all'),
  space: enumParam(SPACE_OPTIONS, 'all'),
  size: enumParam(SIZE_OPTIONS, 'any'),
};

const DASH = '—';
const DEFAULT_SORT = { columnId: 'jumps', direction: 'asc' } as const;

function useColumns(): DataTableColumn<TheraConnectionRow>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'hub',
      header: t('travel.thera.col.hub'),
      sortValue: (row) => row.hub,
      render: (row) => t(`travel.thera.hub.${row.hub}`),
    },
    {
      id: 'signatures',
      header: t('travel.thera.col.signatures'),
      className: 'font-mono tabular-nums',
      render: (row) => `${row.hubSignature ?? DASH} → ${row.exitSignature ?? DASH}`,
    },
    {
      id: 'exit',
      header: t('travel.thera.col.exit'),
      primary: true,
      sortValue: (row) => row.exitSystemName ?? undefined,
      render: (row) => <span className="font-semibold">{row.exitSystemName ?? DASH}</span>,
    },
    {
      id: 'security',
      header: t('travel.thera.col.security'),
      align: 'right',
      sortValue: (row) => row.exitSecurity ?? undefined,
      render: (row) =>
        row.exitSpace === 'wormhole' ? (
          <span className="text-text-dim">{row.exitClass?.toUpperCase() ?? DASH}</span>
        ) : row.exitSecurity === null ? (
          DASH
        ) : (
          <SecurityStatus security={row.exitSecurity} />
        ),
    },
    {
      id: 'region',
      header: t('travel.thera.col.region'),
      className: 'text-text-dim',
      sortValue: (row) => row.exitRegionName ?? undefined,
      render: (row) => row.exitRegionName ?? DASH,
    },
    {
      id: 'type',
      header: t('travel.thera.col.type'),
      render: (row) => row.wormholeType ?? DASH,
    },
    {
      id: 'size',
      header: t('travel.thera.col.size'),
      sortValue: (row) => (row.maxShipSize === null ? undefined : shipSizeRank(row.maxShipSize)),
      render: (row) =>
        row.maxShipSize === null ? DASH : t(`travel.thera.size.${row.maxShipSize}`),
    },
    {
      id: 'life',
      header: t('travel.thera.col.life'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.remainingMs,
      render: (row) => (
        <span className={cx(row.lifeWarning && 'font-semibold text-warning')}>
          {formatCountdown(row.remainingMs / 1000)}
        </span>
      ),
    },
    {
      id: 'jumps',
      header: t('travel.thera.col.jumps'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: jumpsSortValue,
      render: (row) => {
        switch (row.jumps.kind) {
          case 'known':
            return row.jumps.jumps.toLocaleString();
          case 'no-route':
            return <span className="text-text-dim">{t('travel.thera.noGateRoute')}</span>;
          case 'unknown':
          case 'no-origin':
            return DASH;
        }
      },
    },
  ];
}

export function TheraTab({ tabBar }: { tabBar: ReactNode }) {
  const { t } = useTranslation();
  const [params, setParams] = useUrlParams(THERA_PARAMS);
  const current = useCurrentSystem();
  const originId = params.origin ?? current.systemId;
  const originIsCurrent = params.origin === null && current.systemId !== null;
  const originName = useSystemName(originId);
  const state = useTheraConnections(originId, params.pref);
  const columns = useColumns();

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
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label={t('travel.thera.originLabel')} stretch={false}>
            <SolarSystemPicker
              value={originId}
              onChange={(systemId) => setParams({ origin: systemId }, { push: true })}
              ariaLabel={t('travel.thera.changeOrigin', { current: originTrigger })}
              triggerLabel={originTrigger}
            />
          </FilterField>
          <PreferenceField value={params.pref} onChange={(pref) => setParams({ pref })} />
          <OptionField
            label={t('travel.thera.hubLabel')}
            value={params.hub}
            options={HUB_OPTIONS}
            optionLabel={(hub) => t(`travel.thera.hub.${hub}`)}
            onChange={(hub) => setParams({ hub })}
          />
          <OptionField
            label={t('travel.thera.exitLabel')}
            value={params.space}
            options={SPACE_OPTIONS}
            optionLabel={(space) =>
              space === 'all' ? t('travel.thera.anyExit') : t(`common.spaceOption.${space}`)
            }
            onChange={(space) => setParams({ space })}
          />
          <OptionField
            label={t('travel.thera.sizeLabel')}
            value={params.size}
            options={SIZE_OPTIONS}
            optionLabel={(size) => t(`travel.thera.size.${size}`)}
            onChange={(size) => setParams({ size })}
          />
        </div>
      </Panel>
      <TheraBody
        state={state}
        columns={columns}
        filter={{ hub: params.hub, space: params.space, shipSize: params.size }}
        hasOrigin={originId !== null}
        originName={originName}
      />
    </div>
  );
}

function TheraBody({
  state,
  columns,
  filter,
  hasOrigin,
  originName,
}: {
  state: TheraConnectionsState;
  columns: DataTableColumn<TheraConnectionRow>[];
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
  const rows = filterTheraConnections(state.rows, filter);
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
  return (
    <Panel>
      <div className="space-y-3">
        <p role="status" className={cx('text-text-dim', jumpsNote === '' && 'sr-only')}>
          {jumpsNote}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={
              state.rows.length === 0
                ? t('travel.thera.emptyTitle')
                : t('travel.thera.noMatchTitle')
            }
            hint={
              state.rows.length === 0 ? t('travel.thera.emptyHint') : t('travel.thera.noMatchHint')
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            label={t('travel.thera.tableLabel')}
            defaultSort={DEFAULT_SORT}
          />
        )}
      </div>
    </Panel>
  );
}
