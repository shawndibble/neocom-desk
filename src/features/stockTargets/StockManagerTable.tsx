/**
 * The Manager view: every Stock Target, worst first. The Stock Target edits
 * in place (§6c's faint pencil); a row opens Show Info; the row's ⋮ is the
 * item menu every other item row has, plus "Remove from list".
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  IskAmount,
  MenuItem,
  MenuSeparator,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { StockRow } from '@/engine/stockTargets/stockRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { useItemActions } from '@/features/market/itemActions';
import { cx } from '@/lib/cx';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Set once the field has closed, so the blur its own unmount fires cannot save an escaped value.
  const closed = useRef(false);
  const focusAfterCommit = useFocusAfterCommit();
  function close() {
    closed.current = true;
    setDraft(null);
    // The field swaps back to the button: focus follows it (DESIGN.md §7). A new
    // target can move the row out of the status filter, so the heading backs it up.
    focusAfterCommit(buttonRef, () =>
      document.querySelector<HTMLElement>('[data-stock-market-title]')
    );
  }
  if (draft !== null) {
    const commit = () => {
      if (closed.current) return;
      const next = Math.floor(Number(draft));
      if (Number.isFinite(next) && next > 0 && next !== row.target) onSetTarget(row.typeId, next);
      close();
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
        onBlur={() => {
          // Blur that is not the field's own close saves, as leaving any edit field does.
          if (closed.current) return;
          const next = Math.floor(Number(draft));
          if (Number.isFinite(next) && next > 0 && next !== row.target) {
            onSetTarget(row.typeId, next);
          }
          closed.current = true;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      />
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      data-stock-target-edit={row.typeId}
      className={editableValueClassName}
      onClick={(e) => {
        e.stopPropagation();
        closed.current = false;
        setDraft(String(row.target));
      }}
    >
      <span className="sr-only">{t('stockTargets.table.editTargetFor', { name })}, </span>
      {row.target.toLocaleString()}
      <Icon.Rename size={Icon.ICON_SIZE.sm} aria-hidden="true" className="text-text-dim" />
    </button>
  );
}

export function StockManagerTable({
  rows,
  nameOf,
  groupOf,
  onSetTarget,
  onRemove,
}: {
  rows: readonly StockRow[];
  nameOf: (typeId: number) => string;
  /** The item's top-level Market Group, under its name on desktop. */
  groupOf: (typeId: number) => string | undefined;
  onSetTarget: (typeId: number, target: number) => void;
  onRemove: (typeId: number) => void;
}) {
  const { t } = useTranslation();
  const { showInfo } = useItemActions();
  const focusAfterCommit = useFocusAfterCommit();
  const editButton = (typeId: number | undefined) => () =>
    typeId === undefined
      ? null
      : document.querySelector<HTMLElement>(`[data-stock-target-edit="${typeId}"]`);

  /** Removing a row moves focus to the next row's control, else the previous one (DESIGN.md §7). */
  function remove(typeId: number) {
    const index = rows.findIndex((row) => row.typeId === typeId);
    onRemove(typeId);
    // After the row menu has put focus back on its ⋮, or that focus cancels the request.
    window.setTimeout(() =>
      focusAfterCommit(
        editButton(rows[index + 1]?.typeId),
        editButton(rows[index - 1]?.typeId),
        () => document.querySelector<HTMLElement>('[data-stock-market-title]')
      )
    );
  }

  const columns: DataTableColumn<StockRow>[] = [
    {
      id: 'item',
      header: t('stockTargets.table.item'),
      primary: true,
      render: (row) => {
        const group = groupOf(row.typeId);
        return (
          <>
            <span className="font-medium">{nameOf(row.typeId)}</span>
            {/* Desktop only: the phone card's title stays one line (§4a). */}
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
      render: (row) => row.listed.toLocaleString(),
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
          row.inHangar.toLocaleString()
        ) : (
          <span data-dense-omit className="text-text-dim">
            0
          </span>
        ),
      sortValue: (row) => row.inHangar,
    },
    {
      id: 'fill',
      header: '',
      // Between `sm` and `xl` the table is wider than its panel: the Status pill carries the bar's reading there (the card keeps it below `sm`).
      headerCellClassName: 'sm:w-28 max-xl:sm:hidden',
      className: 'max-xl:sm:hidden',
      stackEdge: 'below',
      render: (row) => (
        <StockFillBar
          status={row.status}
          fill={row.fill}
          hangarFill={row.fromHangar / row.target}
        />
      ),
    },
    {
      id: 'restock',
      header: t('stockTargets.table.restock'),
      render: (row) =>
        row.shortfall === 0 ? (
          <span data-dense-omit className="text-text-dim">
            —
          </span>
        ) : (
          // Two lines on desktop; one run of text on a phone card, where a block breaks the line (§4a).
          <span className="sm:flex sm:flex-col">
            {row.fromHangar > 0 && (
              <span className="text-accent sm:whitespace-nowrap">
                {t('stockTargets.table.fromHangar', { n: row.fromHangar.toLocaleString() })}
              </span>
            )}
            {row.fromHangar > 0 && row.toSource > 0 && <span className="sm:hidden"> · </span>}
            {row.toSource > 0 && (
              <span className="text-text-dim sm:whitespace-nowrap">
                {t('stockTargets.table.toSource', { n: row.toSource.toLocaleString() })}
              </span>
            )}
          </span>
        ),
      // Sorts by Shortfall; the cell shows it as its two halves.
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
      // The ⋮ pins to the card's edge on a phone, so line one stays text-tall (§4a).
      className="dt-actions-pinned-only"
      onRowClick={(row) => showInfo(row.typeId, nameOf(row.typeId))}
      rowMoreActions
      rowContextMenu={(row, tr) => (
        <ItemContextMenu
          typeId={row.typeId}
          itemName={nameOf(row.typeId)}
          // The pencil already edits the Stock Target here (§6c restraint).
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
  );
}
