/**
 * Corp assets, grouped by location (issue #4671): a group per office with a
 * row per division (and its Corp deliveries), and on All a group for every
 * other place. A row opens the by-item view filtered to it.
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnPickerMenu, DataTable, type DataTableColumn } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { useUrlSort } from '@/lib/useUrlState';
import { formatCubicMetres } from '@/lib/volume';
import type { CsvColumn } from '@/lib/csv';
import {
  CORP_ASSET_LOCATION_COLUMN_IDS,
  useVisibleCorpAssetLocationColumns,
  type CorpAssetLocationColumnId,
} from './corpAssetsColumns';
import type { LedgerLabels, LocationRow } from './assetLedgerView';

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
  onOpenRow,
  renderToolbar,
  truncated,
  emptyState,
}: {
  rows: readonly LocationRow[];
  labels: LedgerLabels;
  /** Opens the by-item view filtered to this row. */
  onOpenRow: (row: LocationRow) => void;
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

  const csvColumns = useMemo<CsvColumn<LocationRow>[]>(
    () => [
      { header: t('corp.assets.csv.place'), value: (r) => r.groupLabel },
      { header: t('corp.assets.column.place'), value: (r) => r.label },
      { header: t('corp.assets.column.items'), value: (r) => r.cell.itemCount },
      {
        header: t('corp.assets.column.largest'),
        value: (r) =>
          r.cell.topStacks.map((s) => `${labels.typeName(s.typeId)} ×${s.quantity}`).join('; '),
      },
      { header: t('corp.assets.column.value'), value: (r) => r.cell.estimatedValue },
      { header: t('corp.assets.column.volume'), value: (r) => r.cell.volume },
    ],
    [t, labels]
  );
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
      sortValue: sinkDeliveries((r) => r.cell.itemCount),
      render: (r) => formatCount(r.cell.itemCount),
    },
    largest: {
      id: 'largest',
      header: t('corp.assets.column.largest'),
      cellClassName: dim,
      sortValue: sinkDeliveries((r) => r.cell.topStacks[0]?.estimatedValue),
      render: (r) => (r.cell.itemCount === 0 ? '—' : largestText(r)),
    },
    value: {
      id: 'value',
      header: t('corp.assets.column.value'),
      align: 'right',
      className: 'tabular-nums',
      cellClassName: dim,
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
  const goColumn: DataTableColumn<LocationRow> = {
    id: 'go',
    header: '',
    className: 'w-6',
    cardCorner: true,
    render: (r) =>
      r.cell.itemCount === 0 ? null : (
        <Icon.GoTo aria-hidden="true" size={Icon.ICON_SIZE.sm} className="text-text-faint" />
      ),
  };
  const columns = [
    allColumns.place,
    ...CORP_ASSET_LOCATION_COLUMN_IDS.filter((id) => columnVisibility.isVisible(id)).map(
      (id) => allColumns[id]
    ),
    goColumn,
  ];

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
        <DataTable
          label={t('corp.assets.locationTableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          {...sortProps}
          {...tableExport.tableProps}
          density="compact"
          responsive="stack"
          mobileSort
          onRowClick={onOpenRow}
          rowClickable={(r) => r.cell.itemCount > 0}
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
      )}
    </>
  );
}
