/**
 * Corp assets, grouped by item (issue #4671): one row per item type with what
 * the corporation holds, its stock target and shortfall, and where it sits.
 * A row opens in place to list its stacks with their full paths.
 */
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { COL_ICON, COL_ISK, COL_QUANTITY } from '@/components/ui/dataTableWidths';
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
import { formatCount } from '@/lib/formatCount';
import { formatIsk } from '@/lib/isk';
import { useUrlSort } from '@/lib/useUrlState';
import { formatCubicMetres } from '@/lib/volume';
import type { CsvColumn } from '@/lib/csv';
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
import { StockTargetCell } from './StockTargetCell';

export interface ItemTableRow {
  key: string;
  ledger: ItemLedgerRow;
  name: string;
  categoryName: string | null;
}

/** Most chips a Where cell prints before folding the rest into "+N". */
const MAX_PLACEMENT_CHIPS = 3;
/** Most stacks an expanded row lists; a type held in thousands of stacks must not freeze the page. */
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
  /** Below target is on: the table opens on the biggest shortfall. */
  below: boolean;
  blueprintTypeIds: ReadonlySet<number> | null;
  selectMode: boolean;
  selectedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
  canEditTargets: boolean;
  onSetTarget: (typeId: number, target: number) => void;
  onRemoveTarget: (typeId: number) => void;
  /** The page's filter row, given this table's column picker for its `actions` slot. */
  renderToolbar: (columnPicker: ReactNode, exportMenu: ReactNode) => ReactNode;
  truncated: boolean;
  /** Shown instead of the table when no row survives the filters. */
  emptyState: ReactNode;
}) {
  const { t } = useTranslation();
  const columnVisibility = useColumnVisibility(
    useVisibleCorpAssetItemColumns,
    CORP_ASSET_ITEM_DEFAULT_COLUMNS
  );
  const sortProps = useUrlSort('sort', below ? BY_SHORT_BY : BY_VALUE, SORTABLE_IDS);

  const csvColumns = useMemo<CsvColumn<ItemTableRow>[]>(
    () => [
      { header: t('corp.assets.column.item'), value: (r) => r.name },
      {
        header: t('corp.assets.csv.kind'),
        value: (r) => (r.ledger.isBlueprintCopy ? t('assets.blueprintBadge.copy.label') : ''),
      },
      { header: t('corp.assets.column.quantity'), value: (r) => r.ledger.quantity },
      { header: t('corp.assets.column.target'), value: (r) => r.ledger.stock?.target ?? null },
      { header: t('corp.assets.column.shortBy'), value: (r) => r.ledger.stock?.shortBy ?? null },
      {
        header: t('corp.assets.column.where'),
        value: (r) =>
          placementLabels(r.ledger.placements, labels)
            .map((text, i) => `${text} ×${r.ledger.placements[i].quantity}`)
            .join('; '),
      },
      { header: t('corp.assets.column.value'), value: (r) => r.ledger.estimatedValue },
      { header: t('corp.assets.column.volume'), value: (r) => r.ledger.volume },
      { header: t('corp.assets.column.group'), value: (r) => r.categoryName ?? '' },
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

  const allColumns: Record<'item' | CorpAssetItemColumnId, DataTableColumn<ItemTableRow>> = {
    item: {
      id: 'item',
      header: t('corp.assets.column.item'),
      primary: true,
      stickyStart: true,
      stickyStartOnPanel: true,
      sortValue: (r) => r.name.toLowerCase(),
      render: (r) => {
        const kind = assetBlueprintKind(
          { type_id: r.ledger.typeId, is_blueprint_copy: r.ledger.isBlueprintCopy },
          blueprintTypeIds
        );
        return (
          <span className="flex min-w-0 items-center">
            {/* Plain name: the row expands in place, and a row's primary action beats a name link (DESIGN.md §6c); Show info lives in the row menu. */}
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
      width: COL_QUANTITY,
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (r) => r.ledger.quantity,
      render: (r) => formatCount(r.ledger.quantity),
    },
    target: {
      id: 'target',
      header: t('corp.assets.column.target'),
      align: 'right',
      width: '12ch',
      sortValue: (r) => r.ledger.stock?.target,
      render: (r) =>
        // A copy never counts toward its type's target, so it has no cell to set one in.
        r.ledger.isBlueprintCopy || !canEditTargets ? (
          <span className="text-text-dim tabular-nums">{r.ledger.stock?.target ?? '—'}</span>
        ) : (
          <StockTargetCell
            itemName={r.name}
            target={r.ledger.stock?.target}
            onChange={(target) => onSetTarget(r.ledger.typeId, target)}
            onRemove={() => onRemoveTarget(r.ledger.typeId)}
          />
        ),
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
        if (!stock) return null;
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
          <span className="flex flex-wrap gap-1">
            {shown.map((p, i) => (
              <Pill key={`${p.state}|${p.locationId}|${p.division}`} tone={placementTone(p.state)}>
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
      width: COL_ISK,
      className: 'tabular-nums whitespace-nowrap',
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
    cardCorner: 'start',
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
        <DataTable
          label={t('corp.assets.itemTableLabel')}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.key}
          {...sortProps}
          {...tableExport.tableProps}
          density="compact"
          responsive="stack"
          mobileSort
          virtualize="auto"
          expandableRow={{
            leadingIcon: true,
            renderDetail: (r) => <StackList row={r} labels={labels} />,
          }}
          rowContextMenu={(r, tr) => (
            <ItemContextMenu
              typeId={r.ledger.typeId}
              itemName={r.name}
              // Corp assets never loads the blueprint catalog: resolve at once rather than "checking…".
              blueprintTypeID={null}
              hideStockTarget
              linksKeepBrowserMenu
            >
              {tr}
            </ItemContextMenu>
          )}
          rowMoreActions
        />
      )}
    </>
  );
}

function StackList({ row, labels }: { row: ItemTableRow; labels: LedgerLabels }) {
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
            <span className="min-w-0 flex-1 text-text-dim">{stackPathText(stack, labels)}</span>
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
