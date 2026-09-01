/**
 * The Quickbar (CONTEXT.md): a flat, drag-ordered list of saved item
 * shortcuts, rendered in the Market Browser's left column below the tree.
 * Drag-and-drop mirrors the Skill Plan entry list (EntryList.tsx).
 */
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
import { Button } from '@/components/ui';
import type { QuickbarItem } from '@/db';

interface QuickbarRowProps {
  item: QuickbarItem;
  selected: boolean;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
}

function QuickbarRow({ item, selected, onSelect, onRemove }: QuickbarRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.typeId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 border-b border-line px-1 py-1 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('market.quickbar.reorderItem', { name: item.name })}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      <button
        type="button"
        onClick={() => onSelect(item.typeId)}
        aria-current={selected ? 'true' : undefined}
        className={`flex-1 truncate text-left hover:text-accent ${
          selected ? 'text-accent' : 'text-text-dim'
        }`}
      >
        {item.name}
      </button>
      <Button
        variant="danger"
        size="sm"
        aria-label={t('market.quickbar.removeItem', { name: item.name })}
        onClick={() => onRemove(item.typeId)}
      >
        {t('market.quickbar.remove')}
      </Button>
    </li>
  );
}

export interface QuickbarListProps {
  items: readonly QuickbarItem[];
  selectedTypeId: number | null;
  onSelect: (typeId: number) => void;
  onRemove: (typeId: number) => void;
  onReorder: (activeTypeId: number, overTypeId: number) => void;
}

export function QuickbarList({
  items,
  selectedTypeId,
  onSelect,
  onRemove,
  onReorder,
}: QuickbarListProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(Number(active.id), Number(over.id));
  }

  return (
    <div className="mt-3 border-t border-line pt-2">
      <h2 className="pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {t('market.quickbar.title')}
      </h2>
      {items.length === 0 ? (
        <p className="pt-1 text-xs text-text-dim">{t('market.quickbar.empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={items.map((i) => i.typeId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="rounded-xs border border-line">
              {items.map((item) => (
                <QuickbarRow
                  key={item.typeId}
                  item={item}
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
