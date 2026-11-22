/**
 * Corp assets, grouped by location (issue #4671): a group per office with a
 * row per division (and its Corp deliveries), and on All a group for every
 * other place. A row click unfolds what it holds, nested by container
 * (`CorpAssetContents`); its row menu opens the by-item view filtered to it.
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ColumnPickerMenu,
  DataTable,
  MenuItem,
  RowActionsMenu,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { buildContentsTree } from '@/engine/corp/assetLedger';
import type { AssetNameMap } from '@/engine/assetNames';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { useUrlSort } from '@/lib/useUrlState';
import { formatCubicMetres } from '@/lib/volume';
import {
  CORP_ASSET_LOCATION_COLUMN_IDS,
  useVisibleCorpAssetLocationColumns,
  type CorpAssetLocationColumnId,
} from './corpAssetsColumns';
import type { LedgerLabels, LocationRow } from './assetLedgerView';
import { corpAssetLocationCsvColumns } from './corpAssetsCsv';
import { CorpAssetContents } from './CorpAssetContents';

/** `undefined` sinks a row to the end of its group in either sort direction: Corp deliveries always lists after the divisions. */
function sinkDeliveries<V extends string | number | undefined>(
  value: (row: LocationRow) => V
): (row: LocationRow) => V | undefined {
  return (row) => (row.kind === 'deliveries' ? undefined : value(row));
}

const DEFAULT_SORT = { columnId: 'value', direction: 'desc' } as const;
const SORTABLE_IDS = ['place', ...CORP_ASSET_LOCATION_COLUMN_IDS];

export function CorpAssetLocationTable({
  rows,
  labels,
  assetNames,
  itemsViewHref,
  renderToolbar,
  truncated,
  emptyState,
}: {
  rows: readonly LocationRow[];
  labels: LedgerLabels;
  /** In-game names of containers and ships, for the unfolded contents. */
  assetNames: AssetNameMap;
  /** The by-item view filtered to this row: the row menu's destination. */
  itemsViewHref: (row: LocationRow) => string;
  renderToolbar: (columnPicker: ReactNode, exportMenu: ReactNode) => ReactNode;
  truncated: boolean;
  emptyState: ReactNode;
}) {
  const { t } = useTranslation();
  const columnVisibility = useColumnVisibility(
    useVisibleCorpAssetLocationColumns,
    CORP_ASSET_LOCATION_COLUMN_IDS
  );
  const sortProps = useUrlSort('lsort', DEFAULT_SORT, SORTABLE_IDS);

  const largestText = (row: LocationRow) =>
    row.cell.topStacks
      .map((s) => `${labels.typeName(s.typeId)} ×${formatCount(s.quantity)}`)
      .join(', ');

  const csvColumns = useMemo(() => corpAssetLocationCsvColumns(t, labels), [t, labels]);
  const tableExport = useTableExport({
    surface: 'corp-assets',
    columns: csvColumns,
    rows,
    truncated,
    qualifier: 'corp',
  });

  const dim = (row: LocationRow) => (row.cell.itemCount === 0 ? 'text-text-dim' : undefined);
  const allColumns: Record<'place' | CorpAssetLocationColumnId, DataTableColumn<LocationRow>> = {
    place: {
      id: 'place',
      header: t('corp.assets.column.place'),
      primary: true,
      stickyStart: true,
      stickyStartOnPanel: true,
      cellClassName: dim,
      sortValue: sinkDeliveries((r) => r.label.toLowerCase()),
      render: (r) => (r.kind === 'empty' ? t('corp.assets.nothingStored') : r.label),
    },
    items: {
      id: 'items',
      header: t('corp.assets.column.items'),
      align: 'right',
      className: 'tabular-nums',
      cellClassName: dim,
      stackAffix: { after: t('corp.assets.stackAffix.items') },
      sortValue: sinkDeliveries((r) => r.cell.itemCount),
      render: (r) => formatCount(r.cell.itemCount),
    },
    largest: {
      id: 'largest',
      header: t('corp.assets.column.largest'),
      stackAffix: { before: t('corp.assets.stackAffix.largest') },
      cellClassName: dim,
      sortValue: sinkDeliveries((r) => r.cell.topStacks[0]?.estimatedValue),
      render: (r) => (r.cell.itemCount === 0 ? <span data-dense-omit>—</span> : largestText(r)),
    },
    value: {
      id: 'value',
      header: t('corp.assets.column.value'),
      align: 'right',
      className: 'tabular-nums',
      cellClassName: dim,
      cardCorner: true,
      sortValue: sinkDeliveries((r) => r.cell.estimatedValue),
      render: (r) => (r.cell.estimatedValue === 0 ? '—' : formatIsk(r.cell.estimatedValue)),
    },
    volume: {
      id: 'volume',
      header: t('corp.assets.column.volume'),
      align: 'right',
      className: 'tabular-nums',
      cellClassName: dim,
      sortValue: sinkDeliveries((r) => r.cell.volume ?? undefined),
      render: (r) =>
        r.cell.volume === null || r.cell.itemCount === 0 ? '—' : formatCubicMetres(r.cell.volume),
    },
  };
  const columns = [
    allColumns.place,
    ...CORP_ASSET_LOCATION_COLUMN_IDS.filter((id) => columnVisibility.isVisible(id)).map(
      (id) => allColumns[id]
    ),
  ];

  // The row click unfolds the row, so the jump to the by-item view it used to
  // make lives here: a one-action menu, a recorded §6c exception
  // (docs/context/decisions/20261121-111052-corp-assets-location-rows-unfold-on-click-show.md).
  const rowContextMenu = (row: LocationRow, tr: ReactElement) => {
    if (row.cell.itemCount === 0) return tr;
    const href = itemsViewHref(row);
    return (
      <RowActionsMenu
        name={row.label}
        items={
          <MenuItem asChild>
            <Link to={href}>{t('corp.assets.showByItem')}</Link>
          </MenuItem>
        }
      >
        {tr}
      </RowActionsMenu>
    );
  };

  const picker = (
    <ColumnPickerMenu
      available={CORP_ASSET_LOCATION_COLUMN_IDS}
      visible={columnVisibility.visible}
      columnsById={allColumns}
      onToggle={columnVisibility.toggle}
      onReset={columnVisibility.reset}
      buttonLabel={t('common.columnsButton')}
      menuTitle={t('common.columnsMenuTitle')}
      resetLabel={t('common.resetColumns')}
    />
  );
  const exportMenu = (
    <TableActionsMenu name={t('corp.assets.title')} tableExport={tableExport} size="md" />
  );

  return (
    <>
      {renderToolbar(picker, exportMenu)}
      {rows.length === 0 ? (
        emptyState
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            label={t('corp.assets.locationTableLabel')}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            {...sortProps}
            {...tableExport.tableProps}
            density="compact"
            responsive="stack"
            stackLayout="dense"
            mobileSort
            rowContextMenu={rowContextMenu}
            rowMoreActions
            expandableRow={{
              leadingIcon: true,
              renderDetail: (r) =>
                r.cell.itemCount === 0 ? (
                  <p className="px-3 py-1 text-sm text-text-dim">
                    {t('corp.assets.nothingStored')}
                  </p>
                ) : (
                  <CorpAssetContents
                    nodes={buildContentsTree(r.cell.stacks)}
                    labels={labels}
                    assetNames={assetNames}
                  />
                ),
            }}
            groupBy={{
              key: (r) => r.groupKey,
              allWidths: true,
              minSize: 1,
              // An office the corporation keeps nothing in starts folded: its header and flag say it all.
              defaultExpanded: (group) => !group[0].groupEmpty,
              renderHeader: (group) => {
                const first = group[0];
                return (
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                    <span className="font-semibold">{first.groupLabel}</span>
                    <span className="text-xs text-text-dim tabular-nums">
                      {t('corp.assets.groupTotals', {
                        count: first.groupItems,
                        value: formatIsk(first.groupValue),
                      })}
                    </span>
                    {first.groupDivisionsInUse !== null && (
                      <span className="text-xs text-text-dim tabular-nums">
                        {t('corp.assets.divisionsInUse', { count: first.groupDivisionsInUse })}
                      </span>
                    )}
                    {first.groupEmpty && <Pill tone="warning">{t('corp.assets.emptyOffice')}</Pill>}
                  </span>
                );
              },
            }}
          />
        </div>
      )}
    </>
  );
}
