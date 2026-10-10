/**
 * The Manager view: every Stock Target, worst first. The Stock Target edits
 * in place (§6c's faint pencil); a row opens Show Info; the row's ⋮ is the
 * item menu every other item row has, plus "Remove from list".
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, MenuItem, TextInput, type DataTableColumn } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { StockRow } from '@/engine/stockTargets/stockRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { useItemActions } from '@/features/market/itemActions';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { StockFillBar, StockStatusPill } from './StockStatus';

/** Editable-in-place value (§6c): faint pencil at rest, field box on hover/focus; 44px tap area via ::after. */
const editableValueClassName = cx(
  'relative inline-flex items-center gap-1 rounded-xs border border-transparent px-1 tabular-nums hover:border-line-bright hover:bg-panel-2 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[""]',
  interactiveClassName,
  focusRingClassName
);

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
  if (draft !== null) {
    const commit = () => {
      const next = Math.floor(Number(draft));
      if (Number.isFinite(next) && next > 0 && next !== row.target) onSetTarget(row.typeId, next);
      setDraft(null);
    };
    return (
      <TextInput
        size="sm"
        type="number"
        min={1}
        autoFocus
        aria-label={t('stockTargets.table.targetFor', { name })}
        className="w-24 text-right"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(null);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={editableValueClassName}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(String(row.target));
      }}
    >
      <span className="sr-only">{t('stockTargets.table.editTargetFor', { name })}, </span>
      {row.target.toLocaleString()}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-faint" />
    </button>
  );
}

export function StockManagerTable({
  rows,
  nameOf,
  onSetTarget,
  onRemove,
}: {
  rows: readonly StockRow[];
  nameOf: (typeId: number) => string;
  onSetTarget: (typeId: number, target: number) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const { showInfo } = useItemActions();

  const columns: DataTableColumn<StockRow>[] = [
    {
      id: 'item',
      header: t('stockTargets.table.item'),
      primary: true,
      render: (row) => <span className="font-medium">{nameOf(row.typeId)}</span>,
      sortValue: (row) => nameOf(row.typeId),
    },
    {
      id: 'target',
      header: t('stockTargets.table.target'),
      align: 'right',
      headerCellClassName: 'sm:w-32',
      stackAffix: { before: `${t('stockTargets.table.targetAffix')} ` },
      render: (row) => <TargetCell row={row} name={nameOf(row.typeId)} onSetTarget={onSetTarget} />,
      sortValue: (row) => row.target,
    },
    {
      id: 'onHand',
      header: t('stockTargets.table.onHand'),
      align: 'right',
      headerCellClassName: 'sm:w-28',
      className: 'tabular-nums',
      stackAffix: { after: ` ${t('stockTargets.table.onHandAffix')}` },
      render: (row) => row.onHand.toLocaleString(),
      sortValue: (row) => row.onHand,
    },
    {
      id: 'fill',
      header: '',
      headerCellClassName: 'sm:w-32',
      stackEdge: 'below',
      render: (row) => <StockFillBar status={row.status} fill={row.fill} />,
    },
    {
      id: 'shortfall',
      header: t('stockTargets.table.shortfall'),
      align: 'right',
      headerCellClassName: 'sm:w-28',
      className: 'tabular-nums',
      stackAffix: { before: `${t('stockTargets.table.shortfallAffix')} ` },
      render: (row) =>
        row.shortfall > 0 ? (
          row.shortfall.toLocaleString()
        ) : (
          <span data-dense-omit className="text-text-dim">
            {t('stockTargets.table.none')}
          </span>
        ),
      sortValue: (row) => row.shortfall,
    },
    {
      id: 'cost',
      header: t('stockTargets.table.costToFill'),
      align: 'right',
      headerCellClassName: 'sm:w-32',
      className: 'tabular-nums whitespace-nowrap',
      render: (row) =>
        row.costToFill === null ? (
          <span className="text-text-dim">{t('stockTargets.table.noPrice')}</span>
        ) : row.costToFill > 0 ? (
          `${formatIskCompact(row.costToFill)} ISK`
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
      cardCorner: true,
      render: (row) => <StockStatusPill status={row.status} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.typeId}
      label={t('stockTargets.table.label')}
      stackLayout="dense"
      className="sm:table-fixed"
      onRowClick={(row) => showInfo(row.typeId, nameOf(row.typeId))}
      rowMoreActions
      rowContextMenu={(row, tr) => (
        <ItemContextMenu
          typeId={row.typeId}
          itemName={nameOf(row.typeId)}
          extraItems={
            <MenuItem onSelect={() => onRemove(row.typeId)}>
              {t('stockTargets.table.remove')}
            </MenuItem>
          }
        >
          {tr}
        </ItemContextMenu>
      )}
    />
  );
}
