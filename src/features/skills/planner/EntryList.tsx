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
import type { PlanPriority } from '@/engine/types';
import { formatDate, formatDuration, stepTimeline } from '@/lib/duration';
import type { MergedRow } from './queueRows';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;
const ICON_BUTTON = 'w-7 justify-center';

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

/** A row's booster mark: shared by entry and prereq rows. */
function BoosterMark() {
  const { t } = useTranslation();
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label={t('plans.boosterAffects')}
      role="img"
      className="ml-1 inline-block size-3 align-[-0.125em] text-accent"
    >
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
    </svg>
  );
}

function TimelineLine({ start, finish }: { start: Date; finish: Date }) {
  const { t } = useTranslation();
  return (
    <div className="mt-0.5 text-[0.625rem] tabular-nums text-text-dim">
      {t('plans.stepTimeline', { start: formatDate(start), finish: formatDate(finish) })}
    </div>
  );
}

interface EntryRowProps {
  row: Extract<MergedRow, { kind: 'entry' }>;
  name: string;
  boosted: boolean;
  timeline: { start: Date; finish: Date } | null;
  onRemove: (skillTypeID: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

function EntryRow({ row, name, boosted, timeline, onRemove, onSetPriority }: EntryRowProps) {
  const { t } = useTranslation();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id);
  const { entry } = row;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        isDragging ? 'bg-panel-2' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          {...handleProps}
          aria-label={t('plans.reorderEntry', { name })}
          className="cursor-grab touch-none px-1 text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          ⠿
        </button>
        <span className="flex-1 truncate">
          {name} {ROMAN[entry.targetLevel - 1]}
          {boosted && <BoosterMark />}
        </span>
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
        <span className="w-16 text-right tabular-nums text-text-dim">
          {formatDuration(row.seconds)}
        </span>
        <span className="w-16 text-right tabular-nums">
          {formatDuration(row.cumulativeSeconds)}
        </span>
        <Button
          variant="danger"
          size="sm"
          className={ICON_BUTTON}
          onClick={() => onRemove(entry.skillTypeID)}
          aria-label={`${t('plans.remove')} ${name}`}
        >
          <span aria-hidden="true">✕</span>
        </Button>
      </div>
      {timeline && <TimelineLine start={timeline.start} finish={timeline.finish} />}
    </li>
  );
}

interface PrereqRowProps {
  row: Extract<MergedRow, { kind: 'prereq' }>;
  name: string;
  boosted: boolean;
  timeline: { start: Date; finish: Date } | null;
}

/** Prereq-inserted step the user didn't add directly: dimmed, non-interactive, not draggable. */
function PrereqRow({ row, name, boosted, timeline }: PrereqRowProps) {
  const { t } = useTranslation();
  return (
    <li className="border-b border-line px-2 py-1.5 text-xs text-text-faint italic last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="w-6" aria-hidden="true" />
        <span className="flex-1 truncate">
          {name} {ROMAN[row.step.level - 1]}
          <span className="ml-2 text-[0.625rem] uppercase">{t('plans.prereq')}</span>
          {boosted && <BoosterMark />}
        </span>
        <span className="w-16 text-right tabular-nums">{formatDuration(row.step.seconds)}</span>
        <span className="w-16 text-right tabular-nums">
          {formatDuration(row.step.cumulativeSeconds)}
        </span>
      </div>
      {timeline && <TimelineLine start={timeline.start} finish={timeline.finish} />}
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
        className={ICON_BUTTON}
        aria-label={t('plans.removeMarker')}
        onClick={() => onRemove(markerIndex)}
      >
        <span aria-hidden="true">✕</span>
      </Button>
    </li>
  );
}

interface EntryListProps {
  /** Pre-merged entry + marker + prereq rows (see queueRows.ts), in schedule order. */
  rows: readonly MergedRow[];
  /** Row ids that start a new priority band (#27), from placeBandHeaders — may key a prereq row's id when that entry has leading prereq rows. */
  bandsAt: ReadonlyMap<string, PlanPriority>;
  nameFor: (skillTypeID: number) => string;
  /** Step indices (into the underlying scheduled queue) a live Booster speeds up. */
  boostedSteps?: ReadonlySet<number>;
  /** When training begins, for each row's start/finish line (#20). Omitted when there's no wall-clock basis to offer. */
  startDate?: Date;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number) => void;
  onRemoveMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
}

/**
 * Drag-and-drop (keyboard-accessible) list merging plan entries, Remap
 * Markers, and their computed queue (#112): one row per entry with its own
 * per-level/cumulative time, dimmed non-interactive rows for any
 * prereq-inserted steps positioned just ahead of it.
 */
export function EntryList({
  rows,
  bandsAt,
  nameFor,
  boostedSteps,
  startDate,
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

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  const sortableIds = rows.filter((r) => r.kind !== 'prereq').map((r) => r.id);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="rounded-xs border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
            <span className="flex-1" />
            <span className="w-16 text-right">{t('plans.columnPerLevel')}</span>
            <span className="w-16 text-right">{t('plans.columnCumulative')}</span>
          </div>
          <ul>
            {rows.map((row) => {
              const band = bandsAt.get(row.id);
              return (
                <Fragment key={row.id}>
                  {band && <BandHeader priority={band} />}
                  {row.kind === 'entry' && (
                    <EntryRow
                      row={row}
                      name={nameFor(row.entry.skillTypeID)}
                      boosted={row.stepIndices.some((i) => boostedSteps?.has(i) ?? false)}
                      timeline={
                        startDate && row.stepIndices.length > 0
                          ? stepTimeline(
                              { seconds: row.seconds, cumulativeSeconds: row.cumulativeSeconds },
                              startDate
                            )
                          : null
                      }
                      onRemove={onRemove}
                      onSetPriority={onSetPriority}
                    />
                  )}
                  {row.kind === 'prereq' && (
                    <PrereqRow
                      row={row}
                      name={nameFor(row.step.skillTypeID)}
                      boosted={boostedSteps?.has(row.stepIndex) ?? false}
                      timeline={startDate ? stepTimeline(row.step, startDate) : null}
                    />
                  )}
                  {row.kind === 'marker' && (
                    <MarkerRow
                      id={row.id}
                      markerIndex={row.markerIndex}
                      onRemove={onRemoveMarker}
                    />
                  )}
                </Fragment>
              );
            })}
          </ul>
        </div>
      </SortableContext>
    </DndContext>
  );
}
