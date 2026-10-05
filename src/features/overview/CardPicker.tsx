import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  textActionClassName,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  gripHitAreaClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { isCardShown, OVERVIEW_CARD_LABEL, type OverviewCardKey } from './hiddenCards';

function CardToggle({
  cardKey,
  shown,
  onToggle,
}: {
  cardKey: OverviewCardKey;
  shown: boolean;
  onToggle: (key: OverviewCardKey) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-xs ${tappableRowClassName}`}
    >
      <Checkbox checked={shown} onChange={() => onToggle(cardKey)} />
      <span className="truncate">{t(OVERVIEW_CARD_LABEL[cardKey])}</span>
    </label>
  );
}

function SortableCardRow({
  cardKey,
  shown,
  onToggle,
}: {
  cardKey: OverviewCardKey;
  shown: boolean;
  onToggle: (key: OverviewCardKey) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 px-1 ${isDragging ? 'bg-panel-2' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('overview.board.reorderCard', { name: t(OVERVIEW_CARD_LABEL[cardKey]) })}
        className={`cursor-grab touch-none px-1 py-1.5 text-text-faint hover:text-text ${interactiveClassName} ${focusRingClassName} ${gripHitAreaClassName}`}
      >
        <Icon.DragHandle />
      </button>
      <CardToggle cardKey={cardKey} shown={shown} onToggle={onToggle} />
    </li>
  );
}

/**
 * The board's edit menu: drag a card to where you want it, tick it to show
 * it. A popover rather than a dropdown menu because it holds a sortable
 * list — a menu's arrow-key item navigation would fight the drag handles'
 * own keyboard moves (space to lift, arrows to move, space to drop).
 *
 * Alerts is listed last and has no handle: on desktop it is a column beside
 * the grid rather than a slot in it, so there is nowhere to move it to.
 */
export function CardPicker({
  cards,
  order,
  hidden,
  orderCustomised,
  onToggle,
  onMove,
  onShowAll,
  onResetOrder,
}: {
  /** The cards this Character can have — a corp card without roles is not offered. */
  cards: readonly OverviewCardKey[];
  /** Every placeable card in the board's current order (`cardOrder.ts`). */
  order: readonly OverviewCardKey[];
  hidden: readonly string[];
  /** Whether the pilot has set an order of their own, so Reset has something to undo. */
  orderCustomised: boolean;
  onToggle: (key: OverviewCardKey) => void;
  onMove: (active: OverviewCardKey, over: OverviewCardKey) => void;
  onShowAll: () => void;
  onResetOrder: () => void;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A 4px travel before a drag starts, so a tap on the grip is not a drag (as EntryList).
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const titleId = useId();
  // Escape is the keyboard drag's own "cancel", but the popover hears it first
  // and would close, unmounting the drag mid-move. While a card is lifted the
  // popover leaves Escape to the drag.
  const [dragging, setDragging] = useState(false);
  // The cards this Character can have, in the board's order.
  const placeable = order.filter((key) => cards.includes(key));
  // Spoken by dnd-kit's live region. Its defaults read out raw ids ("droppable
  // area industry"), so every message names the card and where it now sits.
  const name = (id: string | number) => t(OVERVIEW_CARD_LABEL[id as OverviewCardKey]);
  const position = (id: string | number) => placeable.indexOf(id as OverviewCardKey) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('overview.board.dragStart', { name: name(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('overview.board.dragOver', {
            name: name(active.id),
            position: position(over.id),
            total: placeable.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('overview.board.dragEnd', {
            name: name(active.id),
            position: position(over.id),
            total: placeable.length,
          })
        : undefined,
    onDragCancel: ({ active }) => t('overview.board.dragCancel', { name: name(active.id) }),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    if (over && active.id !== over.id) {
      onMove(active.id as OverviewCardKey, over.id as OverviewCardKey);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton size="sm" icon={<Icon.EditBoard />} label={t('overview.board.editCards')} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64"
        aria-labelledby={titleId}
        onEscapeKeyDown={(event) => {
          if (dragging) event.preventDefault();
        }}
      >
        <p
          id={titleId}
          className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
        >
          {t('overview.board.editCardsTitle')}
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => setDragging(true)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setDragging(false)}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t('overview.board.dragInstructions') },
          }}
        >
          <SortableContext items={placeable} strategy={verticalListSortingStrategy}>
            <ul>
              {placeable.map((key) => (
                <SortableCardRow
                  key={key}
                  cardKey={key}
                  shown={isCardShown(hidden, key)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {cards.includes('alerts') && (
          // Lined up under the draggable rows' checkboxes: a handle-wide gap.
          <div className="flex items-center gap-1 px-1">
            <span className="w-7 shrink-0" aria-hidden="true" />
            <CardToggle
              cardKey="alerts"
              shown={isCardShown(hidden, 'alerts')}
              onToggle={onToggle}
            />
          </div>
        )}
        <div className="mt-1 flex justify-between gap-2 border-t border-line px-2 pt-2 pb-1">
          <button type="button" className={textActionClassName()} onClick={onShowAll}>
            {t('overview.board.showAllCards')}
          </button>
          <button
            type="button"
            className={textActionClassName(
              'disabled:cursor-default disabled:text-text-faint disabled:no-underline'
            )}
            onClick={onResetOrder}
            disabled={!orderCustomised}
          >
            {t('overview.board.resetOrder')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
