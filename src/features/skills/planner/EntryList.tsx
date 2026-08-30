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
import type { PlanEntry } from '@/engine/types';
import { buildRows } from './markers';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

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
}

function EntryRow({ id, entry, name, onRemove }: EntryRowProps) {
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
  nameFor: (skillTypeID: number) => string;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number) => void;
  onRemoveMarker: (markerIndex: number) => void;
}

/** Drag-and-drop (keyboard-accessible) list of user Skill Plan entries + Remap Markers. */
export function EntryList({
  entries,
  markers,
  nameFor,
  onReorder,
  onRemove,
  onRemoveMarker,
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

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ul className="rounded-xs border border-line">
          {rows.map((row) =>
            row.kind === 'entry' ? (
              <EntryRow
                key={row.id}
                id={row.id}
                entry={row.entry}
                name={nameFor(row.entry.skillTypeID)}
                onRemove={onRemove}
              />
            ) : (
              <MarkerRow
                key={row.id}
                id={row.id}
                markerIndex={row.markerIndex}
                onRemove={onRemoveMarker}
              />
            )
          )}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
