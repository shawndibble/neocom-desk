/**
 * The Quickbar (GLOSSARY.md): a flat, drag-ordered list of saved item
 * shortcuts, rendered in the Market Browser's left column below the tree.
 * Drag-and-drop mirrors the Skill Plan entry list (EntryList.tsx).
 */
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { IconButton, MenuItem, RowActionsMenu, RowMoreActions, TypeIcon } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  gripHitAreaClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { buildQuickbarAnnouncements } from './quickbarAnnouncer';
import { formatCount } from '@/lib/formatCount';
import { formatIskAuto, formatIskCompact } from '@/lib/isk';
import { ShowInfoMenuItem } from './ItemContextMenu';
import { hasQuickbarTarget } from './quickbar';
import type { QuickbarItem } from '@/db';
import type { VsPaid } from './useQuickbarVsPaid';

/** `+50%`, `-12%`, `0%`. */
function formatPercent(percent: number): string {
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

interface QuickbarRowProps {
  item: QuickbarItem;
  /** Current price against what was paid; absent when no wallet basis covers the item. */
  vsPaid?: VsPaid;
  selected: boolean;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
}

function QuickbarRow({ item, vsPaid, selected, onSelect, onRemove }: QuickbarRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.typeId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const hasTarget = hasQuickbarTarget(item);

  return (
    <RowActionsMenu
      name={item.name}
      items={
        <>
          <ShowInfoMenuItem typeId={item.typeId} itemName={item.name} />
          <MenuItem className="text-danger" onSelect={() => onRemove(item.typeId)}>
            {t('market.quickbar.removeMenu')}
          </MenuItem>
        </>
      }
    >
      <li
        ref={setNodeRef}
        style={style}
        className={cx(
          'flex items-center gap-1 border-b border-line px-1 py-1 text-xs last:border-b-0',
          isDragging && 'bg-panel-2',
          selected && selectedRowClassName
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('market.quickbar.reorderItem', { name: item.name })}
          className={cx(
            'cursor-grab touch-none px-1 text-text-faint hover:text-text',
            interactiveClassName,
            focusRingClassName,
            gripHitAreaClassName
          )}
        >
          <Icon.DragHandle />
        </button>
        <div className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            onClick={() => onSelect(item.typeId)}
            aria-current={selected ? 'true' : undefined}
            className={cx(
              'flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-accent hover:underline',
              interactiveClassName,
              focusRingClassName
            )}
          >
            <TypeIcon typeId={item.typeId} size={32} className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.name}</span>
            {hasTarget && (
              <span className="shrink-0 text-text-dim">
                {/* Compact stays text: IskAmount's focusable trigger can't nest in this button. */}
                {(item.targetDirection === 'above' ? '≥ ' : '≤ ') +
                  formatIskCompact(item.targetPrice!)}
              </span>
            )}
          </button>
        </div>
        {vsPaid && (
          // Hidden below the list's own width, so the name keeps its room first.
          <HintText
            className={cx(
              'hidden shrink-0 font-semibold tabular-nums @[15rem]:inline',
              vsPaid.percent > 0 && 'text-success',
              vsPaid.percent < 0 && 'text-danger',
              vsPaid.percent === 0 && 'text-text-dim'
            )}
            content={t('market.quickbar.vsPaid.tooltip', {
              price: formatIskAuto(vsPaid.price),
              paid: formatIskAuto(vsPaid.paid),
              count: vsPaid.units,
              units: formatCount(vsPaid.units),
            })}
          >
            {formatPercent(vsPaid.percent)}
            <span className="sr-only">
              {' '}
              {t('market.quickbar.vsPaid.label', { name: item.name })}
            </span>
          </HintText>
        )}
        <RowMoreActions />
      </li>
    </RowActionsMenu>
  );
}

export interface QuickbarListProps {
  items: readonly QuickbarItem[];
  /** Price against paid, by type id; omitted items show no chip. */
  vsPaid?: ReadonlyMap<number, VsPaid>;
  selectedTypeId: number | null;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onReorder: (activeTypeId: number, overTypeId: number) => void;
  onViewInAppraisal: () => void;
}

export function QuickbarList({
  items,
  vsPaid,
  selectedTypeId,
  onSelect,
  onRemove,
  onReorder,
  onViewInAppraisal,
}: QuickbarListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A 4px travel before a drag starts, so a tap on the grip is not a drag (as EntryList).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(Number(active.id), Number(over.id));
  }

  return (
    <div className="mt-3 shrink-0 border-t border-line pt-2" data-testid="quickbar">
      <div className="flex items-center justify-between pb-1">
        <h2 className={eyebrowClassName}>{t('market.quickbar.title')}</h2>
        <IconButton
          size="sm"
          icon={<Icon.Market />}
          label={t('market.quickbar.viewInAppraisal')}
          onClick={onViewInAppraisal}
          disabled={items.length === 0}
        />
      </div>
      {items.length === 0 ? (
        <p className="pt-1 text-xs text-text-dim">{t('market.quickbar.empty')}</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements: buildQuickbarAnnouncements(items, t),
            screenReaderInstructions: { draggable: t('market.quickbar.drag.instructions') },
          }}
        >
          <SortableContext
            items={items.map((i) => i.typeId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="@container max-h-80 overflow-y-auto rounded-xs border border-line">
              {items.map((item) => (
                <QuickbarRow
                  key={item.typeId}
                  item={item}
                  vsPaid={vsPaid?.get(item.typeId)}
                  selected={item.typeId === selectedTypeId}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
