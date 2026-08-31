import { Fragment } from 'react';
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
import { Button, EmptyState } from '@/components/ui';
import { PRIORITY_ORDER } from '@/engine/planPriority';
import type { PlanEntry, PlanPriority } from '@/engine/types';
import { bandStarts } from './bands';
import { buildRows } from './markers';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/** i18n key for a priority's display label, e.g. 'high' -> 'plans.priorityHigh'. */
function priorityLabelKey(priority: PlanPriority): string {
  return `plans.priority${priority[0].toUpperCase()}${priority.slice(1)}`;
}

interface BandHeaderProps {
  priority: PlanPriority;
}

/** Divider marking where a run of same-priority entries begins (#27). */
function BandHeader({ priority }: BandHeaderProps) {
  const { t } = useTranslation();
  const label = t(priorityLabelKey(priority));
  return (
    <li className="border-b border-line bg-panel-2 px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-text-dim">
      {t('plans.priorityBand', { label })}
    </li>
  );
}

interface SortableRowChrome {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  handleProps: Record<string, unknown>;
  isDragging: boolean;
}

/** Shared useSortable plumbing for entry and marker rows. */
function useRowSortable(id: string): SortableRowChrome {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    handleProps: { ...attributes, ...listeners },
    isDragging,
  };
}

interface EntryRowProps {
  id: string;
  entry: PlanEntry;
  name: string;
  onRemove: (skillTypeID: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

function EntryRow({ id, entry, name, onRemove, onSetPriority }: EntryRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...handleProps}
        aria-label={t('plans.reorderEntry', { name })}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      <span className="flex-1 truncate">{name}</span>
      <span className="text-text-dim">{ROMAN[entry.targetLevel - 1]}</span>
      <select
        aria-label={t('plans.priorityLabel', { name })}
        value={entry.priority ?? 'normal'}
        onChange={(e) => onSetPriority(entry.skillTypeID, e.target.value as PlanPriority)}
        className="h-6 rounded-xs border border-line bg-panel-2 px-1 text-text"
      >
        {PRIORITY_ORDER.map((priority) => (
          <option key={priority} value={priority}>
            {t(priorityLabelKey(priority))}
          </option>
        ))}
      </select>
      <Button variant="danger" size="sm" onClick={() => onRemove(entry.skillTypeID)}>
        {t('plans.remove')}
      </Button>
    </li>
  );
}

interface MarkerRowProps {
  id: string;
  markerIndex: number;
  onRemove: (markerIndex: number) => void;
}

/** Remap Marker (CONTEXT.md): accent divider row, draggable like an entry. */
function MarkerRow({ id, markerIndex, onRemove }: MarkerRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-line px-2 py-1 text-xs text-accent last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...handleProps}
        aria-label={t('plans.reorderMarker')}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      <span aria-hidden className="h-px flex-1 bg-accent/60" />
      <span className="font-semibold uppercase tracking-wide">{t('plans.markerRow')}</span>
      <span aria-hidden className="h-px flex-1 bg-accent/60" />
      <Button
        variant="danger"
        size="sm"
        aria-label={t('plans.removeMarker')}
        onClick={() => onRemove(markerIndex)}
      >
        {t('plans.remove')}
      </Button>
    </li>
  );
}

interface EntryListProps {
  entries: readonly PlanEntry[];
  /** Remap Marker positions (see markers.ts). */
  markers: readonly number[] | undefined;
  /** Effective priority per skill typeID (inherited from dependents, #27). */
  priorityFor: ReadonlyMap<number, PlanPriority>;
  nameFor: (skillTypeID: number) => string;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number) => void;
  onRemoveMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

/** Drag-and-drop (keyboard-accessible) list of user Skill Plan entries + Remap Markers. */
export function EntryList({
  entries,
  markers,
  priorityFor,
  nameFor,
  onReorder,
  onRemove,
  onRemoveMarker,
  onSetPriority,
}: EntryListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  const rows = buildRows(entries, markers);
  const bandsAt = bandStarts(rows, priorityFor);

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ul className="rounded-xs border border-line">
          {rows.map((row) => {
            const band = bandsAt.get(row.id);
            return (
              <Fragment key={row.id}>
                {band && <BandHeader priority={band} />}
                {row.kind === 'entry' ? (
                  <EntryRow
                    id={row.id}
                    entry={row.entry}
                    name={nameFor(row.entry.skillTypeID)}
                    onRemove={onRemove}
                    onSetPriority={onSetPriority}
                  />
                ) : (
                  <MarkerRow id={row.id} markerIndex={row.markerIndex} onRemove={onRemoveMarker} />
                )}
              </Fragment>
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
