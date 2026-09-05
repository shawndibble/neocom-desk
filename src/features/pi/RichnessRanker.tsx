/**
 * The pilot's own best-to-worst ranking of one planet's P0 resources
 * (issue #425).
 *
 * A ranking, never a percentage: the in-game scan overlay shows a colour map
 * and ESI publishes nothing at all, so "Pyerite is richer than Noble Metals
 * here" is a claim a pilot can actually make and "Pyerite is at 74%" is not.
 *
 * Drag-and-drop mirrors `market/QuickbarList.tsx` and the Skill Plan entry
 * list, keyboard sensor included — the ranking is the only way to record scan
 * knowledge, so it must not be pointer-only.
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
import { buttonClassName } from '@/components/ui';

interface RankRowProps {
  typeId: number;
  name: string;
  rank: number;
}

function RankRow({ typeId, name, rank }: RankRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: typeId,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 border-b border-line px-1 py-1 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t('piAdvisor.reorderResource', { name })}
        className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⠿
      </button>
      <span className="w-4 shrink-0 tabular-nums text-text-faint">{rank}</span>
      <span className="min-w-0 truncate">{name}</span>
    </li>
  );
}

export interface RichnessRankerProps {
  /** Ranked resources, richest first. */
  ranked: readonly number[];
  /** Resources on this planet the pilot has not ranked, in payload order. */
  unranked: readonly number[];
  resourceName: (typeId: number) => string;
  onChange: (order: number[]) => void;
}

/**
 * The ranked list, plus one "add" control per unranked resource.
 *
 * Unranked resources are listed separately rather than pre-filled into the
 * ordering, because a pre-filled order is a claim the pilot never made — and
 * `estimateUnbuiltPlanet` prices the top-ranked resource, so an accidental
 * first place would quietly become the planet's headline number.
 */
export function RichnessRanker({ ranked, unranked, resourceName, onChange }: RichnessRankerProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ranked.indexOf(Number(active.id));
    const to = ranked.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ranked];
    next.splice(to, 0, ...next.splice(from, 1));
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {ranked.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={[...ranked]} strategy={verticalListSortingStrategy}>
            <ul aria-label={t('piAdvisor.rankingLabel')} className="rounded-xs border border-line">
              {ranked.map((typeId, index) => (
                <RankRow
                  key={typeId}
                  typeId={typeId}
                  name={resourceName(typeId)}
                  rank={index + 1}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {unranked.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unranked.map((typeId) => (
            <button
              key={typeId}
              type="button"
              onClick={() => onChange([...ranked, typeId])}
              className={buttonClassName({ size: 'sm', variant: 'ghost' })}
            >
              {t('piAdvisor.addToRanking', { name: resourceName(typeId) })}
            </button>
          ))}
        </div>
      )}

      {ranked.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className={buttonClassName({ size: 'sm', variant: 'ghost' })}
        >
          {t('piAdvisor.clearRanking')}
        </button>
      )}
    </div>
  );
}
