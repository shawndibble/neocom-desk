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
import { entryId } from './reorder';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

interface EntryRowProps {
  entry: PlanEntry;
  name: string;
  onRemove: (skillTypeID: number) => void;
}

function EntryRow({ entry, name, onRemove }: EntryRowProps) {
  const { t } = useTranslation();
  const id = entryId(entry);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center justify-between gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
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

interface EntryListProps {
  entries: readonly PlanEntry[];
  nameFor: (skillTypeID: number) => string;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number) => void;
}

/** Drag-and-drop (keyboard-accessible) list of user Skill Plan entries. */
export function EntryList({ entries, nameFor, onReorder, onRemove }: EntryListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  if (entries.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={entries.map(entryId)} strategy={verticalListSortingStrategy}>
        <ul className="rounded-xs border border-line">
          {entries.map((entry) => (
            <EntryRow
              key={entryId(entry)}
              entry={entry}
              name={nameFor(entry.skillTypeID)}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
