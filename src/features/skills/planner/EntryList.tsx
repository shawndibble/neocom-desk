import { Fragment, useMemo } from 'react';
import { MD_UP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import type { MilestoneStatus } from '@/engine/skills/skillPlanMilestones';
import type { Attributes, Implants, PlanPriority } from '@/engine/types';
import type { AttributePair } from './attributePairBands';
import type { ColumnVisibility } from './columnPreference';
import type { MergedRow, PinnedInProgressEntry } from './queueRows';
import { buildRowAnnouncer } from './rowAnnouncer';
import { BandHeader, type BandInfo } from './entryList/BandHeader';
import { EntryRow } from './entryList/EntryRow';
import { MarkerRow } from './entryList/MarkerRow';
import { PrereqRow } from './entryList/PrereqRow';
import { ACTION_SPACER, TIME_CELL } from './entryList/rowChrome';

/** Stable identity: a literal default would be a new object on every render, defeating MarkerRow's memo. */
const EMPTY_IMPLANTS: Implants = {};

interface EntryListProps {
  /** Pre-merged entry + marker + prereq rows (see queueRows.ts), in schedule order. */
  rows: readonly MergedRow[];
  /** Row ids that start a new band (#27, #115), from placeBandHeaders — may key a prereq row's id when that entry has leading prereq rows. */
  bandsAt: ReadonlyMap<string, BandInfo>;
  nameFor: (skillTypeID: number) => string;
  /** A skill's primary/secondary attribute pair, when known (#114). */
  attributesFor: (skillTypeID: number) => AttributePair | undefined;
  /** Which optional row parts are enabled — the "Columns" control's device-local preference (#114). */
  columns: ColumnVisibility;
  /** Step indices (into the underlying scheduled queue) a live Booster speeds up. */
  boostedSteps?: ReadonlySet<number>;
  /** Step indices (into the underlying scheduled queue) above the Alpha skill cap. */
  alphaCappedSteps?: ReadonlySet<number>;
  /** When training begins, for each row's finish date (#20). Omitted when there's no wall-clock basis to offer — rows then fall back to a running total. */
  startDate?: Date;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number, targetLevel: number) => void;
  /** See EntryRowProps' field of the same name. */
  /** Runs as a skill name is clicked, before the link navigates — carries this plan's entries to the modal. */
  onStageSkillDetail: (skillTypeID: number) => void;
  /** See EntryRowProps' field of the same name. */
  removalBlockedReason: (skillTypeID: number, targetLevel: number) => string | undefined;
  onRemoveMarker: (markerIndex: number) => void;
  /** A marker's target attribute spread, once known. Undefined when no "Optimize at my markers" result covers it yet. */
  markerAttributesFor?: (markerIndex: number) => Attributes | undefined;
  /** Implant bonuses a marker's spread is shown with (PlanEditor's What-If lens). Omitted reads as no implants. */
  markerImplants?: Implants;
  /** Opens the manual attribute editor (RemapMarkerModal) for a marker. */
  onEditMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  /**
   * The plan entry that is also the in-game queue's currently-training level,
   * if any (#1701 follow-up) — see `queueRows.ts`'s `pinnedInProgressEntry`.
   */
  pinnedInProgress?: PinnedInProgressEntry | null;
  /** Turn a derived prereq row into a real entry where it already sits (GLOSSARY.md "Prereq Promotion"). */
  onPromotePrereq: (rowId: string) => void;
  /** An entry row's Plan Milestone (GLOSSARY.md), keyed by (skillTypeID, level) — see `skillPlanSchedule.ts`'s `stepKey`. Derived prereq rows never carry one (out of scope). */
  milestoneStatusFor: (skillTypeID: number, targetLevel: number) => MilestoneStatus | undefined;
  onAddMilestone: (skillTypeID: number, targetLevel: number) => void;
  /** Opens the naming Modal, prefilled, for an existing milestone. */
  onRenameMilestone: (milestoneId: string) => void;
  onRemoveMilestone: (milestoneId: string) => void;
}

/**
 * Drag-and-drop (keyboard-accessible) list merging plan entries, Remap
 * Markers, and their computed queue (#112): one row per entry with its own
 * per-level/cumulative time, dimmed rows for any prereq-inserted steps
 * positioned just ahead of it. Every row is draggable — dragging a dimmed
 * prereq row promotes it into a real entry (see planDrop.ts), which is why the
 * list hands ids straight to SortableContext rather than filtering prereq rows
 * out of it. Optional columns (attribute pair, priority, per-level time,
 * cumulative time) are individually toggleable, and rows fold to two lines
 * below the `md` breakpoint (#114).
 *
 * Each entry row trains one level (reorder.ts) and names it.
 */
export function EntryList({
  rows,
  bandsAt,
  nameFor,
  attributesFor,
  columns,
  boostedSteps,
  alphaCappedSteps,
  startDate,
  onReorder,
  onRemove,
  onStageSkillDetail,
  removalBlockedReason,
  onRemoveMarker,
  markerAttributesFor,
  markerImplants = EMPTY_IMPLANTS,
  onEditMarker,
  onSetPriority,
  pinnedInProgress,
  onPromotePrereq,
  milestoneStatusFor,
  onAddMilestone,
  onRenameMilestone,
  onRemoveMilestone,
}: EntryListProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery(MD_UP_QUERY);
  const sensors = useSensors(
    // A bare PointerSensor starts dragging on the first pixel of pointer
    // movement, which both fires from ordinary jitter on a click (the
    // row's buttons sit close to the drag handle) and fights a
    // tap-to-expand/tap-to-remove gesture on touch (#408). Requiring a small
    // travel distance first is dnd-kit's own recommended fix for exactly this.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  const { announcements } = useMemo(() => buildRowAnnouncer(rows, nameFor, t), [rows, nameFor, t]);
  const sortableIds = useMemo(() => rows.map((r) => r.id), [rows]);

  if (rows.length === 0) {
    return <EmptyState title={t('plans.yourEntriesEmpty')} className="py-4" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('plans.dragInstructions') },
      }}
      // Wider edge threshold and stronger acceleration than dnd-kit's default
      // (#408): the entry list's own scroller is often the last few hundred
      // pixels of a long capped-height panel, and the default threshold gave
      // a dragged row too little room near the top/bottom edge to trigger
      // autoscroll before the pointer ran out of list to drag within.
      autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="rounded-xs border border-line">
          {isDesktop && (columns.perLevelTime || columns.cumulativeTime) && (
            <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              <span className="flex-1" />
              {columns.perLevelTime && <span className={TIME_CELL}>{t('plans.columnTakes')}</span>}
              {columns.cumulativeTime && (
                <span className={TIME_CELL}>{t('plans.columnDoneBy')}</span>
              )}
              {/* Clears each row's trailing remove/promote button, so the headers sit over their own columns. */}
              <span aria-hidden="true" className={ACTION_SPACER} />
            </div>
          )}
          <ul>
            {rows.map((row) => {
              const band = bandsAt.get(row.id);
              return (
                <Fragment key={row.id}>
                  {band && <BandHeader band={band} />}
                  {row.kind === 'entry' && (
                    <EntryRow
                      row={row}
                      name={nameFor(row.entry.skillTypeID)}
                      attributes={attributesFor(row.entry.skillTypeID)}
                      boostedSteps={boostedSteps}
                      alphaCappedSteps={alphaCappedSteps}
                      startDate={startDate}
                      columns={columns}
                      isDesktop={isDesktop}
                      onRemove={onRemove}
                      onStageSkillDetail={onStageSkillDetail}
                      removalBlockedReason={removalBlockedReason}
                      onSetPriority={onSetPriority}
                      pinnedInProgress={pinnedInProgress}
                      milestoneStatus={milestoneStatusFor(
                        row.entry.skillTypeID,
                        row.entry.targetLevel
                      )}
                      onAddMilestone={onAddMilestone}
                      onRenameMilestone={onRenameMilestone}
                      onRemoveMilestone={onRemoveMilestone}
                    />
                  )}
                  {row.kind === 'prereq' && (
                    <PrereqRow
                      row={row}
                      name={nameFor(row.step.skillTypeID)}
                      attributes={attributesFor(row.step.skillTypeID)}
                      boosted={boostedSteps?.has(row.stepIndex) ?? false}
                      alphaCapped={alphaCappedSteps?.has(row.stepIndex) ?? false}
                      startDate={startDate}
                      columns={columns}
                      isDesktop={isDesktop}
                      onPromote={onPromotePrereq}
                      onStageSkillDetail={onStageSkillDetail}
                    />
                  )}
                  {row.kind === 'marker' && (
                    <MarkerRow
                      id={row.id}
                      markerIndex={row.markerIndex}
                      attributes={markerAttributesFor?.(row.markerIndex)}
                      implants={markerImplants}
                      onRemove={onRemoveMarker}
                      onEdit={onEditMarker}
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
