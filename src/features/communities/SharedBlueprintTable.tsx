import { useCallback, type ReactElement } from 'react';
import { OpenInEveItemMenuItems } from '@/features/market/ItemContextMenu';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ColumnPickerMenu,
  DataTable,
  DisabledMenuItem,
  EmptyState,
  MenuItem,
  RowActionsMenu,
  type DataTableColumn,
} from '@/components/ui';
import { COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import { Pill } from '@/components/ui/Pill';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { ItemInfoLink } from '@/features/entities/EntityLink';
import { BuildPlanMenuItem } from '@/features/industry/BuildPlanContextMenu';
import { usePlannableIndexOnOpen } from '@/features/industry/usePlannableIndexOnOpen';
import {
  useCurrentSystem,
  useJumpRangeFilter,
  type JumpsCellValue,
} from '@/features/route/currentSystem';
import { jumpsCellSortValue, renderJumpsCell } from '@/features/route/jumpsCell';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { openItemInfo } from '@/stores/itemInfoModal';
import { placeNamesSystem, type SharedBlueprintRow } from './sharedBlueprintCopies';
import {
  SHARED_BLUEPRINT_COLUMN_IDS,
  useVisibleSharedBlueprintColumns,
  type SharedBlueprintColumnId,
} from './sharedBlueprintColumns';

function SharedBlueprintMenu({
  row,
  systemId,
  children,
}: {
  row: SharedBlueprintRow;
  systemId: number | null | undefined;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { index, onOpenChange } = usePlannableIndexOnOpen();
  return (
    <RowActionsMenu
      name={row.name}
      linksKeepBrowserMenu
      onOpenChange={onOpenChange}
      items={
        <>
          <MenuItem onSelect={() => openItemInfo(row.typeId, row.name)}>
            {t('market.contextMenu.showInfo')}
          </MenuItem>
          <OpenInEveItemMenuItems typeId={row.typeId} />
          <BuildPlanMenuItem
            typeId={row.typeId}
            index={index}
            seed={row.runs < 0 ? null : { me: row.me, te: row.te, runs: row.runs }}
          />
          <MenuItem onSelect={() => navigate(bpcSourcingHref(row.typeId))}>
            {t('communities.library.openInSourcing')}
          </MenuItem>
          {systemId === undefined ? (
            <MenuItem aria-disabled onSelect={(event) => event.preventDefault()}>
              {t('communities.library.viewRouteChecking')}
            </MenuItem>
          ) : systemId === null ? (
            <DisabledMenuItem reason={t('communities.library.systemUnknown')}>
              {t('travel.waypoints.viewRoute')}
            </DisabledMenuItem>
          ) : (
            <MenuItem onSelect={() => navigate(routeToHref(systemId))}>
              {t('travel.waypoints.viewRoute')}
            </MenuItem>
          )}
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}

export function SharedBlueprintColumnPicker() {
  const { t } = useTranslation();
  const { visible, toggle, reset } = useColumnVisibility(
    useVisibleSharedBlueprintColumns,
    SHARED_BLUEPRINT_COLUMN_IDS
  );
  const columnsById = Object.fromEntries(
    SHARED_BLUEPRINT_COLUMN_IDS.map((id) => [
      id,
      { id, header: t(`communities.library.columns.${id}`), render: () => null },
    ])
  ) as unknown as Record<SharedBlueprintColumnId, DataTableColumn<SharedBlueprintRow>>;
  return (
    <ColumnPickerMenu
      available={SHARED_BLUEPRINT_COLUMN_IDS}
      visible={visible}
      columnsById={columnsById}
      onToggle={toggle}
      onReset={reset}
      buttonLabel={t('common.columnsButton')}
      menuTitle={t('common.columnsMenuTitle')}
      resetLabel={t('common.resetColumns')}
    />
  );
}

export function SharedBlueprintTable({
  rows,
  systemIds,
}: {
  rows: readonly SharedBlueprintRow[];
  systemIds: ReadonlyMap<string, number> | null;
}) {
  const { t } = useTranslation();
  const { isVisible } = useColumnVisibility(
    useVisibleSharedBlueprintColumns,
    SHARED_BLUEPRINT_COLUMN_IDS
  );
  const currentSystem = useCurrentSystem();
  const jumpFilter = useJumpRangeFilter(currentSystem, 'any');
  const systemIdOf = useCallback(
    (row: SharedBlueprintRow): number | null | undefined =>
      systemIds === null ? undefined : (systemIds.get(row.systemName.toLowerCase()) ?? null),
    [systemIds]
  );
  const rowJumps = useCallback(
    (row: SharedBlueprintRow): JumpsCellValue => {
      if (jumpFilter.jumpsStatus !== 'ready') return { kind: jumpFilter.jumpsStatus };
      const systemId = systemIdOf(row);
      if (systemId === undefined) return { kind: 'loading' };
      return {
        kind: 'value',
        count: systemId === null ? null : (jumpFilter.jumps?.get(systemId) ?? null),
      };
    },
    [jumpFilter, systemIdOf]
  );

  if (rows.length === 0) return <EmptyState title={t('communities.library.none')} />;
  const columns: DataTableColumn<SharedBlueprintRow>[] = [
    {
      id: 'name',
      header: t('communities.library.columns.blueprint'),
      primary: true,
      className: 'truncate',
      render: (row) => (
        <ItemInfoLink typeId={row.typeId} itemName={row.name}>
          {row.name}
        </ItemInfoLink>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: 'member',
      header: t('communities.library.columns.member'),
      width: '26ch',
      render: (row) => (
        <span className="flex min-w-0 items-center">
          <span className="truncate">{row.memberName}</span>
          {row.stale && <Pill className="ml-1 shrink-0">{t('communities.staleBadge')}</Pill>}
        </span>
      ),
      sortValue: (row) => row.memberName,
    },
    {
      id: 'location',
      header: t('communities.library.columns.location'),
      className: 'truncate',
      render: (row) => (
        <>
          {row.locationName}
          {!placeNamesSystem(row.locationName, row.systemName) && (
            <span className="block truncate text-text-dim">{row.systemName}</span>
          )}
        </>
      ),
      sortValue: (row) => `${row.systemName} ${row.locationName}`,
    },
    {
      id: 'jumps',
      header: t('communities.library.columns.jumps'),
      align: 'right',
      width: COL_SMALL_NUMBER,
      className: 'tabular-nums',
      sortFirst: 'asc',
      sortValue: (row) => jumpsCellSortValue(rowJumps(row)),
      render: (row) =>
        renderJumpsCell(rowJumps(row), t, 'communities.library.jumpsUnavailable', systemIdOf(row)),
    },
    {
      id: 'meTe',
      header: t('communities.library.columns.meTe'),
      align: 'right',
      headerClassName: 'whitespace-nowrap',
      width: '10ch',
      className: 'whitespace-nowrap',
      render: (row) => `${row.me} / ${row.te}`,
      sortValue: (row) => row.me * 100 + row.te,
    },
    {
      id: 'runs',
      header: t('communities.library.columns.runs'),
      align: 'right',
      width: '12ch',
      className: 'whitespace-nowrap',
      render: (row) =>
        row.runs < 0
          ? t('communities.library.bpo')
          : t('communities.library.runs', { count: row.runs }),
      sortValue: (row) => (row.runs < 0 ? Number.MAX_SAFE_INTEGER : row.runs),
    },
  ];
  const shownColumns = columns.filter(
    (column) => column.id === 'name' || isVisible(column.id as SharedBlueprintColumnId)
  );
  return (
    <div className="overflow-x-auto edge-fade-end">
      <DataTable
        label={t('communities.library.sharedLabel')}
        columns={shownColumns}
        rows={rows}
        rowKey={(row) => row.key}
        rowClassName={(row) => (row.stale ? 'opacity-60' : undefined)}
        rowContextMenu={(row, tr) => (
          <SharedBlueprintMenu row={row} systemId={systemIdOf(row)}>
            {tr}
          </SharedBlueprintMenu>
        )}
        rowMoreActions
        defaultSort={{ columnId: 'name', direction: 'asc' }}
        virtualize="auto"
      />
    </div>
  );
}
