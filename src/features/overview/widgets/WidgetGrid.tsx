/**
 * A widget board's grid: flex-wrap rows of widgets in layout order.
 *
 * No gap-filling, on purpose: reading order is screen order is the order the
 * pilot arranged, so Move up and Move down do what they say. A row's leftover
 * width is shared by `flex-grow`, so there are no holes.
 *
 * While customizing, each widget gets a size control, earlier / later / remove
 * buttons and (on a pointer-sized screen) a drag handle. The buttons are the
 * keyboard and touch route; dragging is a convenience over the same
 * `moveTo` action. A phone customizes in a list instead (`PhoneCustomizeList`).
 */
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, IconButton, SegmentedControl } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  gripHitAreaClassName,
  interactiveClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { boardKey, useWidgetBoard } from './board';
import { useOverviewEdit } from './editContext';
import { flexRule, GRID_GAP, PHONE_GRID_GAP } from './gridStyle';
import { getKind, type WidgetSize } from './kinds';
import type { Widget as WidgetModel } from './layout';
import { SIZES } from './sizes';
import { visibleWidgets } from './visibility';
import { Widget } from './Widget';
import { WidgetMenu } from './WidgetMenu';

interface WidgetGridProps {
  widgets: readonly WidgetModel[];
  editing?: boolean;
  onRemove: (id: string) => void;
  /** The empty board's Add widget; absent where there is no Gallery to open. */
  onAdd?: () => void;
  /** The empty board's Start from a role. */
  onRoles?: () => void;
}

function useWidgetTitle() {
  const { t } = useTranslation();
  return (widget: WidgetModel): string => {
    const kind = getKind(widget.kind);
    return widget.title ?? (kind ? t(kind.titleKey) : widget.kind);
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function EditControls({
  widget,
  title,
  first,
  last,
}: {
  widget: WidgetModel;
  title: string;
  first: boolean;
  last: boolean;
}) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  return (
    <div className="flex items-center gap-1.5 border-t border-dashed border-line p-1.5">
      <SegmentedControl<WidgetSize>
        label={t('overview.customize.sizeGroup', { title })}
        size="sm"
        value={widget.size}
        options={SIZES.map((size) => ({
          value: size,
          label: t(`overview.customize.size.${size}`),
        }))}
        onChange={(size) => edit.resize(widget.id, size)}
      />
      <span className="flex-1" />
      <IconButton
        size="sm"
        icon={<Icon.Ascending />}
        label={t('overview.customize.moveEarlier', { title })}
        disabled={first}
        onClick={() => edit.step(widget.id, 'earlier')}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('overview.customize.moveLater', { title })}
        disabled={last}
        onClick={() => edit.step(widget.id, 'later')}
      />
      <IconButton
        size="sm"
        tone="danger"
        icon={<Icon.RemoveWidget />}
        label={t('overview.customize.remove', { title })}
        onClick={() => edit.remove(widget.id)}
      />
    </div>
  );
}

interface CellProps {
  widget: WidgetModel;
  title: string;
  editing: boolean;
  first: boolean;
  last: boolean;
  isPhone: boolean;
  onRemove: (id: string) => void;
  /** Set only inside the sortable context. */
  sortable?: boolean;
}

/** One widget in its flex cell: scroll-and-flash on add, and the edit chrome. */
function Cell({
  widget,
  title,
  editing,
  first,
  last,
  isPhone,
  onRemove,
  sortable = false,
}: CellProps) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const flashing = edit.flashId === widget.id;
  const plainRef = useRef<HTMLDivElement>(null);
  const sort = useSortable({ id: widget.id, disabled: !sortable });
  const sortNode = sort.node;

  useEffect(() => {
    if (!flashing) return;
    const node = sortable ? sortNode.current : plainRef.current;
    node?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [flashing, sortable, sortNode]);

  const style: CSSProperties = {
    ...flexRule(widget.size, isPhone),
    ...(sortable
      ? {
          transform: CSS.Transform.toString(sort.transform),
          transition: sort.transition,
          opacity: sort.isDragging ? 0.6 : undefined,
        }
      : null),
  };

  let handle: ReactNode = null;
  if (sortable) {
    handle = (
      <button
        type="button"
        {...sort.attributes}
        {...sort.listeners}
        aria-label={t('overview.customize.dragHandle', { title })}
        className={cx(
          'shrink-0 cursor-grab touch-none py-1 text-text-faint hover:text-text',
          interactiveClassName,
          focusRingClassName,
          gripHitAreaClassName
        )}
      >
        <Icon.DragHandle />
      </button>
    );
  }

  return (
    <div
      ref={sortable ? sort.setNodeRef : plainRef}
      data-widget-id={widget.id}
      className={cx(
        'flex min-w-0',
        flashing && 'rounded-xs outline-2 outline-offset-2 outline-accent'
      )}
      style={style}
    >
      <Widget
        widget={widget}
        editing={editing}
        onRemove={onRemove}
        menu={<WidgetMenu widget={widget} />}
        headerStart={handle}
        editControls={
          editing ? <EditControls widget={widget} title={title} first={first} last={last} /> : null
        }
      />
    </div>
  );
}

function EmptyBoard({ onAdd, onRoles }: Pick<WidgetGridProps, 'onAdd' | 'onRoles'>) {
  const { t } = useTranslation();
  const board = useWidgetBoard();
  return (
    <section className="grid justify-items-start gap-2 rounded-xs border border-dashed border-line bg-panel/85 p-4">
      <h2 className="text-sm font-semibold">{t(boardKey(board, 'customize.emptyTitle'))}</h2>
      <p className="text-xs text-text-dim">{t(boardKey(board, 'customize.emptyBody'))}</p>
      <span className="flex flex-wrap gap-2">
        {onAdd && (
          <Button variant="primary" onClick={onAdd}>
            <Icon.AddWidget size={Icon.ICON_SIZE.md} aria-hidden="true" />
            {t('overview.customize.add')}
          </Button>
        )}
        {onRoles && <Button onClick={onRoles}>{t('overview.customize.roles')}</Button>}
      </span>
    </section>
  );
}

export function WidgetGrid({
  widgets,
  editing = false,
  onRemove,
  onAdd,
  onRoles,
}: WidgetGridProps) {
  const { t } = useTranslation();
  const edit = useOverviewEdit();
  const titleOf = useWidgetTitle();
  const isPhone = useIsPhone();
  const board = useWidgetBoard();
  const shown = visibleWidgets(widgets, isPhone, board.canDraw);
  const sensors = useSensors(
    // A 4px travel before a drag starts, so a tap on the grip is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [dragging, setDragging] = useState(false);

  // Known widgets this Character may not see (every one's corp capability gone) read as an empty
  // board: "nothing to show" would blame the phone or a newer build for what is a role.
  const known = widgets.filter((w) => getKind(w.kind) !== undefined);
  const hiddenByBoard = known.length > 0 && !known.some((w) => board.canDraw(getKind(w.kind)!));
  if (widgets.length === 0 || hiddenByBoard) {
    return <EmptyBoard onAdd={onAdd} onRoles={onRoles} />;
  }
  if (shown.length === 0) {
    return (
      <p className="rounded-xs border border-line bg-panel/85 px-3 py-4 text-xs text-text-dim">
        {t(boardKey(board, 'widgets.noWidgets'))}
      </p>
    );
  }

  const sortable = editing && !isPhone;
  const nameOf = (id: string | number) => {
    const found = shown.find((w) => w.id === id);
    return found ? titleOf(found) : String(id);
  };
  const position = (id: string | number) => shown.findIndex((w) => w.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('overview.customize.dragStart', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('overview.customize.dragOver', {
            name: nameOf(active.id),
            position: position(over.id),
            total: shown.length,
          })
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('overview.customize.dragEnd', {
            name: nameOf(active.id),
            position: position(over.id),
            total: shown.length,
          })
        : undefined,
    onDragCancel: ({ active }) => t('overview.customize.dragCancel', { name: nameOf(active.id) }),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    setDragging(false);
    if (over && active.id !== over.id) edit.moveTo(String(active.id), String(over.id));
  }

  const cells = shown.map((widget, index) => (
    <Cell
      key={widget.id}
      widget={widget}
      title={titleOf(widget)}
      editing={editing}
      first={index === 0}
      last={index === shown.length - 1}
      isPhone={isPhone}
      onRemove={onRemove}
      sortable={sortable}
    />
  ));

  const rows = (
    <div
      className={cx('flex min-w-0 flex-wrap items-stretch', dragging && 'select-none')}
      style={{ gap: isPhone ? PHONE_GRID_GAP : GRID_GAP }}
    >
      {cells}
    </div>
  );

  if (!sortable) return rows;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => setDragging(true)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(false)}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('overview.customize.dragInstructions') },
      }}
    >
      <SortableContext items={shown.map((w) => w.id)} strategy={rectSortingStrategy}>
        {rows}
      </SortableContext>
    </DndContext>
  );
}
