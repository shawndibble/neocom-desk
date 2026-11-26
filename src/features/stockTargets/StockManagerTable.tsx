import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  ColumnPickerMenu,
  DataTable,
  EditableValue,
  FieldError,
  IskAmount,
  MenuItem,
  MenuSeparator,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { stockStatusRank, type StockRow } from '@/engine/stockTargets/stockRows';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { useItemActions } from '@/features/market/itemActions';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useRowSelection } from '@/lib/useRowSelection';
import { StockFillBar, StockStatusPill } from './StockStatus';
import { formatNumber } from '@/lib/numberLocale';
import { formatDuration } from '@/lib/duration';
import { useNow } from '@/lib/useNow';
import { StockHolders } from './StockHolders';
import { stockCsvColumns } from './stockCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { STOCK_COLUMN_IDS, useVisibleStockColumns, type StockColumnId } from './stockColumns';

function TargetCell({
  row,
  name,
  onSetTarget,
}: {
  row: StockRow;
  name: string;
  onSetTarget: (typeId: number, target: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  const seeded = useRef(false);
  const focusAfterCommit = useFocusAfterCommit();
  function close() {
    closed.current = true;
    setDraft(null);
    focusAfterCommit(buttonRef, () =>
      document.querySelector<HTMLElement>('[data-stock-market-title]')
    );
  }
  if (draft !== null) {
    const commit = (moveFocus = true) => {
      if (closed.current) return;
      const next = Math.floor(Number(draft));
      if (draft.trim() === '' || !Number.isFinite(next) || next <= 0) {
        setInvalid(true);
        return;
      }
      if (next !== row.target) onSetTarget(row.typeId, next);
      if (moveFocus) close();
      else {
        closed.current = true;
        setDraft(null);
      }
    };
    const errorId = `stock-target-error-${row.typeId}`;
    return (
      <span className="inline-flex flex-col items-end">
        <TextInput
          size="sm"
          inputMode="numeric"
          autoFocus
          aria-label={t('stockTargets.table.targetFor', { name })}
          className="w-24 text-right"
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onFocus={(e) => {
            const field = e.currentTarget;
            if (seeded.current) field.setSelectionRange(field.value.length, field.value.length);
            else field.select();
          }}
          onClick={(e) => e.stopPropagation()}
          onBlur={() => {
            commit(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
        />
        {invalid && (
          <FieldError id={errorId} className="text-xs">
            {t('stockTargets.table.targetInvalid')}
          </FieldError>
        )}
      </span>
    );
  }
  return (
    <EditableValue
      ref={buttonRef}
      data-stock-target-edit={row.typeId}
      label={t('stockTargets.table.editTargetFor', { name })}
      onEdit={(seed) => {
        closed.current = false;
        setInvalid(false);
        const digit = seed !== undefined && /^\d$/.test(seed);
        seeded.current = digit;
        setDraft(digit ? seed : String(row.target));
      }}
    >
      {formatNumber(row.target)}
    </EditableValue>
  );
}

export function StockManagerTable({
  rows,
  nameOf,
  groupOf,
  characterName,
  selectionKey,
  onSetTarget,
  onRemove,
  onRemoveMany,
}: {
  rows: readonly StockRow[];
  nameOf: (typeId: number) => string;
  groupOf: (typeId: number) => string | undefined;
  characterName: ((characterId: number) => string) | undefined;
  selectionKey: string;
  onSetTarget: (typeId: number, target: number) => void;
  onRemove: (typeId: number) => void;
  onRemoveMany: (typeIds: number[]) => void;
}) {
  const { t } = useTranslation();
  const { showInfo } = useItemActions();
  const focusAfterCommit = useFocusAfterCommit();
  const editButton = (typeId: number | undefined) => () =>
    typeId === undefined
      ? null
      : document.querySelector<HTMLElement>(`[data-stock-target-edit="${typeId}"]`);

  function remove(typeId: number) {
    const index = rows.findIndex((row) => row.typeId === typeId);
    onRemove(typeId);
    window.setTimeout(() =>
      focusAfterCommit(
        editButton(rows[index + 1]?.typeId),
        editButton(rows[index - 1]?.typeId),
        () => document.querySelector<HTMLElement>('[data-stock-market-title]')
      )
    );
  }

  const selection = useRowSelection(
    selectionKey,
    rows.map((row) => row.typeId)
  );

  function removeSelected() {
    const chosen = rows.filter((row) => selection.selected.has(row.typeId));
    if (chosen.length === 0) return;
    const first = rows.findIndex((row) => selection.selected.has(row.typeId));
    const remaining = rows.filter((row) => !selection.selected.has(row.typeId));
    const next = rows.slice(first).find((row) => !selection.selected.has(row.typeId));
    const prev = remaining.filter((row) => rows.indexOf(row) < first).at(-1);
    selection.clear();
    onRemoveMany(chosen.map((row) => row.typeId));
    window.setTimeout(() =>
      focusAfterCommit(editButton(next?.typeId), editButton(prev?.typeId), () =>
        document.querySelector<HTMLElement>('[data-stock-market-title]')
      )
    );
  }

  const selectColumn: DataTableColumn<StockRow> = {
    id: 'select',
    header: '',
    className: 'w-8',
    cardCorner: 'start',
    render: (row) => (
      <label className={touchCheckboxLabelClassName} onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selection.selected.has(row.typeId)}
          onChange={() => selection.toggle(row.typeId)}
          aria-label={t('stockTargets.table.selectAria', { name: nameOf(row.typeId) })}
        />
      </label>
    ),
  };

  const nowMs = useNow();
  function jobEndLabel(endDate: string): string {
    const seconds = (Date.parse(endDate) - nowMs) / 1000;
    return seconds > 0
      ? t('stockTargets.table.inJobsEnds', { when: formatDuration(seconds) })
      : t('stockTargets.table.inJobsReady');
  }

  const columns: DataTableColumn<StockRow>[] = [
    selectColumn,
    {
      id: 'item',
      header: t('stockTargets.table.item'),
      primary: true,
      render: (row) => {
        const group = groupOf(row.typeId);
        return (
          <>
            <span className="font-medium">{nameOf(row.typeId)}</span>
            {group && (
              <span className="hidden text-[0.6875rem] text-text-dim sm:block">{group}</span>
            )}
          </>
        );
      },
      sortValue: (row) => nameOf(row.typeId),
    },
    {
      id: 'target',
      header: t('stockTargets.table.target'),
      align: 'right',
      headerCellClassName: 'sm:w-24',
      stackAffix: { before: `${t('stockTargets.table.targetAffix')} ` },
      render: (row) => <TargetCell row={row} name={nameOf(row.typeId)} onSetTarget={onSetTarget} />,
      sortValue: (row) => row.target,
    },
    {
      id: 'listed',
      header: t('stockTargets.table.listed'),
      align: 'right',
      headerCellClassName: 'sm:w-24',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.table.listedAffix')}` },
      render: (row) => (
        <>
          {characterName && row.listedBy ? (
            <StockHolders
              total={row.listed}
              holders={row.listedBy}
              heading={t('stockTargets.holders.listedBy')}
              nameOf={characterName}
            />
          ) : (
            formatNumber(row.listed)
          )}
          {row.onContract ? (
            <span className="block text-xs text-text-dim">
              {t('stockTargets.table.onContract', { count: row.onContract })}
            </span>
          ) : null}
        </>
      ),
      sortValue: (row) => row.listed,
    },
    {
      id: 'inHangar',
      header: t('stockTargets.table.inHangar'),
      align: 'right',
      headerCellClassName: 'sm:w-28 whitespace-nowrap',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.table.inHangarAffix')}` },
      render: (row) =>
        row.inHangar > 0 ? (
          characterName && row.inHangarBy ? (
            <StockHolders
              total={row.inHangar}
              holders={row.inHangarBy}
              heading={t('stockTargets.holders.readyWith')}
              nameOf={characterName}
            />
          ) : (
            formatNumber(row.inHangar)
          )
        ) : (
          <span data-dense-omit className="text-text-dim">
            0
          </span>
        ),
      sortValue: (row) => row.inHangar,
    },
    {
      id: 'inJobs',
      header: t('stockTargets.table.inJobs'),
      headerTooltip: t('stockTargets.table.inJobsHint'),
      align: 'right',
      headerCellClassName: 'sm:w-28 whitespace-nowrap',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.table.inJobsAffix')}` },
      render: (row) =>
        row.inJobs > 0 ? (
          <>
            {formatNumber(row.inJobs)}
            {row.nextJobEnd && (
              <span className="block text-xs text-text-dim">{jobEndLabel(row.nextJobEnd)}</span>
            )}
          </>
        ) : (
          <span data-dense-omit className="text-text-dim">
            0
          </span>
        ),
      sortValue: (row) => row.inJobs,
    },
    {
      id: 'fill',
      header: t('stockTargets.table.fill'),
      headerCellClassName: 'sm:w-28 max-xl:sm:hidden',
      className: 'max-xl:sm:hidden',
      stackEdge: 'below',
      render: (row) => (
        <StockFillBar
          status={row.status}
          fill={row.fill}
          hangarFill={row.fromHangar / row.target}
          jobsFill={row.fromJobs / row.target}
        />
      ),
      sortValue: (row) => row.fill,
    },
    {
      id: 'restock',
      header: t('stockTargets.table.restock'),
      headerClassName: 'max-xl:sm:px-2',
      className: 'max-xl:sm:px-2',
      render: (row) =>
        row.shortfall === 0 ? (
          <span data-dense-omit className="text-text-dim">
            —
          </span>
        ) : (
          <span className="sm:flex sm:flex-col">
            {row.fromHangar > 0 && (
              <span className="text-accent sm:whitespace-nowrap">
                {t('stockTargets.table.fromHangar', { n: formatNumber(row.fromHangar) })}
              </span>
            )}
            {row.fromHangar > 0 && row.fromJobs > 0 && <span className="sm:hidden"> · </span>}
            {row.fromJobs > 0 && (
              <span className="text-text-dim sm:whitespace-nowrap">
                {t('stockTargets.table.fromJobs', { n: formatNumber(row.fromJobs) })}
              </span>
            )}
            {row.fromHangar + row.fromJobs > 0 && row.toSource > 0 && (
              <span className="sm:hidden"> · </span>
            )}
            {row.toSource > 0 && (
              <span className="text-text-dim sm:whitespace-nowrap">
                {t('stockTargets.table.toSource', { n: formatNumber(row.toSource) })}
              </span>
            )}
          </span>
        ),
      sortValue: (row) => row.shortfall,
    },
    {
      id: 'cost',
      header: t('stockTargets.table.costToFill'),
      headerTooltip: t('stockTargets.table.costHint'),
      align: 'right',
      headerCellClassName: 'sm:w-24',
      className: 'tabular-nums whitespace-nowrap',
      render: (row) =>
        row.costToFill === null ? (
          <span className="text-text-dim">{t('stockTargets.table.noPrice')}</span>
        ) : row.costToFill > 0 ? (
          <>
            <IskAmount value={row.costToFill} /> ISK
          </>
        ) : (
          <span data-dense-omit className="text-text-dim">
            —
          </span>
        ),
      sortValue: (row) => row.costToFill ?? -1,
    },
    {
      id: 'status',
      header: t('stockTargets.table.status'),
      headerCellClassName: 'sm:w-24',
      headerClassName: 'max-xl:sm:px-2',
      className: 'max-xl:sm:px-2',
      cardCorner: true,
      render: (row) => <StockStatusPill status={row.status} />,
      sortValue: (row) => stockStatusRank(row.status),
      sortFirst: 'asc',
    },
  ];

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleStockColumns,
    STOCK_COLUMN_IDS
  );
  const columnsById = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
    StockColumnId,
    DataTableColumn<StockRow>
  >;
  const anyJobs = rows.some((row) => row.inJobs > 0);
  const shownColumns = columns.filter(
    (column) =>
      column.id === 'select' ||
      column.id === 'item' ||
      (isVisible(column.id as StockColumnId) && (column.id !== 'inJobs' || anyJobs))
  );

  const stockColumns = useMemo(
    () => stockCsvColumns(t, { nameOf, groupOf, characterName }),
    [t, nameOf, groupOf, characterName]
  );
  const stockExport = useTableExport({
    surface: 'stock-targets',
    rows,
    columns: stockColumns,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button size="sm" onClick={selection.selectAll}>
          {t('stockTargets.table.selectAll')}
        </Button>
        <Button size="sm" aria-disabled={selection.selected.size === 0} onClick={selection.clear}>
          {t('stockTargets.table.selectNone')}
        </Button>
        {selection.selected.size > 0 && (
          <Button size="sm" onClick={removeSelected}>
            {t('stockTargets.table.removeSelected', { count: selection.selected.size })}
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2">
          <ColumnPickerMenu
            available={STOCK_COLUMN_IDS}
            visible={visible}
            columnsById={columnsById}
            onToggle={toggle}
            onReset={reset}
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            resetLabel={t('common.resetColumns')}
          />
          <TableActionsMenu name={t('stockTargets.table.label')} tableExport={stockExport} />
        </span>
      </div>
      <DataTable
        columns={shownColumns}
        rows={rows}
        mobileSort
        rowKey={(row) => row.typeId}
        {...stockExport.tableProps}
        label={t('stockTargets.table.label')}
        stackLayout="dense"
        className="dt-actions-pinned-only"
        onRowClick={(row) => showInfo(row.typeId, nameOf(row.typeId))}
        rowMoreActions
        rowContextMenu={(row, tr) => (
          <ItemContextMenu
            typeId={row.typeId}
            itemName={nameOf(row.typeId)}
            hideStockTarget
            extraItems={
              <>
                <MenuSeparator />
                <MenuItem className="text-danger" onSelect={() => remove(row.typeId)}>
                  {t('stockTargets.table.remove')}
                </MenuItem>
              </>
            }
          >
            {tr}
          </ItemContextMenu>
        )}
      />
    </>
  );
}
