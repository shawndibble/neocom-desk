import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { COL_ICON } from '@/components/ui/dataTableWidths';
import { Checkbox, ColumnPickerMenu, DataTable, type DataTableColumn } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { BlueprintBadge } from '@/features/assets/assetBrowserRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { assetBlueprintKind } from '@/engine/blueprintKind';
import type { ItemLedgerRow, StockStatus } from '@/engine/corp/assetLedger';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { cx } from '@/lib/cx';
import type { AssetNameMap } from '@/engine/assetNames';
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { useUrlSort } from '@/lib/useUrlState';
import { formatCubicMetres } from '@/lib/volume';
import {
  CORP_ASSET_ITEM_COLUMN_IDS,
  CORP_ASSET_ITEM_DEFAULT_COLUMNS,
  useVisibleCorpAssetItemColumns,
  type CorpAssetItemColumnId,
} from './corpAssetsColumns';
import {
  placementLabels,
  placementTone,
  stackPathText,
  type LedgerLabels,
} from './assetLedgerView';
import { corpAssetItemCsvColumns } from './corpAssetsCsv';
import { StockTargetCell } from './StockTargetCell';
import { TableScroll } from '@/components/ui/TableScroll';

export interface ItemTableRow {
  key: string;
  ledger: ItemLedgerRow;
  name: string;
  categoryName: string | null;
}

const MAX_PLACEMENT_CHIPS = 3;
const MAX_STACKS_SHOWN = 100;

const BY_VALUE = { columnId: 'value', direction: 'desc' } as const;
const BY_SHORT_BY = { columnId: 'shortBy', direction: 'desc' } as const;
const SORTABLE_IDS = ['item', ...CORP_ASSET_ITEM_COLUMN_IDS];

const STATUS_TONE: Readonly<Record<StockStatus, string>> = {
  short: 'text-warning',
  'none-owned': 'text-danger',
  met: 'text-success',
};

export function CorpAssetItemTable({
  rows,
  labels,
  assetNames,
  below,
  blueprintTypeIds,
  selectMode,
  selectedKeys,
  onToggleKey,
  canEditTargets,
  onSetTarget,
  onRemoveTarget,
  renderToolbar,
  truncated,
  emptyState,
}: {
  rows: readonly ItemTableRow[];
  labels: LedgerLabels;
  assetNames: AssetNameMap;
  below: boolean;
  blueprintTypeIds: ReadonlySet<number> | null;
  selectMode: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
  canEditTargets: boolean;
  onSetTarget: (typeId: number, target: number) => void;
  onRemoveTarget: (typeId: number) => void;
  renderToolbar: (columnPicker: ReactNode, exportMenu: ReactNode) => ReactNode;
  truncated: boolean;
  emptyState: ReactNode;
}) {
  const { t } = useTranslation();
  const columnVisibility = useColumnVisibility(
    useVisibleCorpAssetItemColumns,
    CORP_ASSET_ITEM_DEFAULT_COLUMNS
  );
  const sortProps = useUrlSort('sort', below ? BY_SHORT_BY : BY_VALUE, SORTABLE_IDS);

  const csvColumns = useMemo(
    () => corpAssetItemCsvColumns(t, { labels, assetNames, blueprintTypeIds }, rows),
    [t, labels, assetNames, blueprintTypeIds, rows]
  );
  const tableExport = useTableExport({
    surface: 'corp-assets',
    columns: csvColumns,
    rows,
    truncated,
    qualifier: 'corp',
  });

  const allColumns: Record<'item' | CorpAssetItemColumnId, DataTableColumn<ItemTableRow>> = {
    item: {
      id: 'item',
      header: t('corp.assets.column.item'),
      primary: true,
      stickyStart: true,
      stickyStartOnPanel: true,
      width: '30ch',
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => {
        const kind = assetBlueprintKind(
          { type_id: r.ledger.typeId, is_blueprint_copy: r.ledger.isBlueprintCopy },
          blueprintTypeIds
        );
        return (
          <span className="flex min-w-0 items-center">
            <span className="truncate">{r.name}</span>
            {kind && <BlueprintBadge kind={kind} t={t} />}
          </span>
        );
      },
    },
    quantity: {
      id: 'quantity',
      header: t('corp.assets.column.quantity'),
      align: 'right',
      width: '13.5ch',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { before: t('corp.assets.stackAffix.quantity') },
      sortValue: (r) => r.ledger.quantity,
      render: (r) => formatCount(r.ledger.quantity),
    },
    target: {
      id: 'target',
      header: t('corp.assets.column.target'),
      align: 'right',
      width: '12ch',
      stackAffix: { before: t('corp.assets.stackAffix.target') },
      sortValue: (r) => r.ledger.stock?.target,
      render: (r) => {
        if (r.ledger.isBlueprintCopy || !canEditTargets) {
          const target = r.ledger.stock?.target;
          const cell = <span className="text-text-dim tabular-nums">{target ?? '—'}</span>;
          return target === undefined ? <span data-dense-omit>{cell}</span> : cell;
        }
        return (
          <StockTargetCell
            itemName={r.name}
            target={r.ledger.stock?.target}
            onChange={(target) => onSetTarget(r.ledger.typeId, target)}
            onRemove={() => onRemoveTarget(r.ledger.typeId)}
          />
        );
      },
    },
    shortBy: {
      id: 'shortBy',
      header: t('corp.assets.column.shortBy'),
      align: 'right',
      width: '22ch',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (r) => r.ledger.stock?.shortBy,
      render: (r) => {
        const stock = r.ledger.stock;
        if (!stock) return <span data-dense-omit />;
        return (
          <span className={STATUS_TONE[stock.status]}>
            {formatCount(stock.shortBy)}
            {stock.status === 'none-owned' && (
              <span className="ml-1.5 text-[0.6875rem]">{t('corp.assets.noneOwned')}</span>
            )}
          </span>
        );
      },
    },
    where: {
      id: 'where',
      header: t('corp.assets.column.where'),
      stackEdge: 'below',
      sortValue: (r) => {
        return placementLabels(r.ledger.placements, labels)[0]?.toLowerCase();
      },
      render: (r) => {
        const { placements } = r.ledger;
        if (placements.length === 0) return <span className="text-text-dim">—</span>;
        const texts = placementLabels(placements, labels);
        const shown = placements.slice(0, MAX_PLACEMENT_CHIPS);
        const hidden = placements.length - shown.length;
        return (
          <span className="inline-flex flex-wrap gap-1">
            {shown.map((p, i) => (
              <Pill
                key={`${p.state}|${p.locationId}|${p.division}`}
                tone={placementTone(p.state)}
                className="sm:whitespace-nowrap"
              >
                {texts[i]} ×{formatCount(p.quantity)}
              </Pill>
            ))}
            {hidden > 0 && <Pill>{t('corp.assets.morePlacements', { count: hidden })}</Pill>}
          </span>
        );
      },
    },
    value: {
      id: 'value',
      header: t('corp.assets.column.value'),
      align: 'right',
      width: '17ch',
      className: 'tabular-nums whitespace-nowrap',
      cardCorner: true,
      sortValue: (r) => r.ledger.estimatedValue,
      render: (r) => (r.ledger.estimatedValue === 0 ? '—' : formatIsk(r.ledger.estimatedValue)),
    },
    volume: {
      id: 'volume',
      header: t('corp.assets.column.volume'),
      align: 'right',
      width: '14ch',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (r) => r.ledger.volume ?? undefined,
      render: (r) => (r.ledger.volume === null ? '—' : formatCubicMetres(r.ledger.volume)),
    },
    group: {
      id: 'group',
      header: t('corp.assets.column.group'),
      width: '20ch',
      className: 'truncate',
      sortValue: (r) => r.categoryName?.toLowerCase(),
      render: (r) => r.categoryName ?? '—',
    },
  };

  const selectColumn: DataTableColumn<ItemTableRow> = {
    id: 'select',
    header: '',
    width: COL_ICON,
    className: 'w-8',
    stackEdge: 'start',
    render: (r) => (
      <label className={touchCheckboxLabelClassName}>
        <Checkbox
          checked={selectedKeys.has(r.key)}
          onChange={() => onToggleKey(r.key)}
          aria-label={t('assets.select.itemAriaLabel', { name: r.name })}
        />
      </label>
    ),
  };

  const columns = [
    ...(selectMode ? [selectColumn] : []),
    allColumns.item,
    ...CORP_ASSET_ITEM_COLUMN_IDS.filter((id) => columnVisibility.isVisible(id)).map(
      (id) => allColumns[id]
    ),
  ];

  const picker = (
    <ColumnPickerMenu
      available={CORP_ASSET_ITEM_COLUMN_IDS}
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
        <TableScroll>
          <DataTable
            label={t('corp.assets.itemTableLabel')}
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            {...sortProps}
            {...tableExport.tableProps}
            density="compact"
            responsive="stack"
            stackLayout="dense"
            mobileSort
            virtualize="auto"
            expandableRow={{
              leadingIcon: true,
              renderDetail: (r) => <StackList row={r} labels={labels} assetNames={assetNames} />,
            }}
            rowContextMenu={(r, tr) => (
              <ItemContextMenu
                typeId={r.ledger.typeId}
                itemName={r.name}
                holdingsOnly
                linksKeepBrowserMenu
              >
                {tr}
              </ItemContextMenu>
            )}
            rowMoreActions
          />
        </TableScroll>
      )}
    </>
  );
}

function StackList({
  row,
  labels,
  assetNames,
}: {
  row: ItemTableRow;
  labels: LedgerLabels;
  assetNames: AssetNameMap;
}) {
  const { t } = useTranslation();
  const stacks = useMemo(
    () => [...row.ledger.stacks].sort((a, b) => b.estimatedValue - a.estimatedValue),
    [row.ledger.stacks]
  );
  if (stacks.length === 0) {
    return <p className="px-3 py-2 text-sm text-text-dim">{t('corp.assets.noStacks')}</p>;
  }
  const shown = stacks.slice(0, MAX_STACKS_SHOWN);
  return (
    <div className="px-3 py-2">
      <ul className="divide-y divide-line text-sm">
        {shown.map((stack) => (
          <li key={stack.itemId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
            <span className="min-w-0 flex-1 text-text-dim">
              {assetNames[stack.itemId] !== undefined && (
                <span className="block font-medium text-text">{assetNames[stack.itemId]}</span>
              )}
              {stackPathText(stack, labels)}
            </span>
            <span className="tabular-nums">×{formatCount(stack.quantity)}</span>
            <span className={cx('text-xs text-text-dim', stack.isSingleton === null && 'hidden')}>
              {stack.isSingleton ? t('corp.assets.assembled') : t('corp.assets.packaged')}
            </span>
          </li>
        ))}
      </ul>
      {stacks.length > shown.length && (
        <p className="pt-1 text-xs text-text-dim">
          {t('corp.assets.moreStacks', { count: stacks.length - shown.length })}
        </p>
      )}
    </div>
  );
}
