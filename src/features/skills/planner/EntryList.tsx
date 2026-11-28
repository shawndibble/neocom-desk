import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { Fragment, useMemo } from 'react';
import { MD_UP_QUERY, useMediaQuery, usePrefersReducedMotion } from '@/lib/useMediaQuery';
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

const EMPTY_IMPLANTS: Implants = {};

interface EntryListProps {
  rows: readonly MergedRow[];
  bandsAt: ReadonlyMap<string, BandInfo>;
  nameFor: (skillTypeID: number) => string;
  attributesFor: (skillTypeID: number) => AttributePair | undefined;
  columns: ColumnVisibility;
  boostedSteps?: ReadonlySet<number>;
  alphaCappedSteps?: ReadonlySet<number>;
  startDate?: Date;
  onReorder: (activeId: string, overId: string) => void;
  onRemove: (skillTypeID: number, targetLevel: number) => void;
  onStageSkillDetail: (skillTypeID: number) => void;
  removalBlockedReason: (skillTypeID: number, targetLevel: number) => string | undefined;
  onRemoveMarker: (markerIndex: number) => void;
  markerAttributesFor?: (markerIndex: number) => Attributes | undefined;
  markerImplants?: Implants;
  onEditMarker: (markerIndex: number) => void;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  pinnedInProgress?: PinnedInProgressEntry | null;
  onPromotePrereq: (rowId: string) => void;
  milestoneStatusFor: (skillTypeID: number, targetLevel: number) => MilestoneStatus | undefined;
  onAddMilestone: (skillTypeID: number, targetLevel: number) => void;
  onRenameMilestone: (milestoneId: string) => void;
  onRemoveMilestone: (milestoneId: string) => void;
}

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
  const reducedMotion = usePrefersReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  }

  const { announcements } = useMemo(() => buildRowAnnouncer(rows, nameFor, t), [rows, nameFor, t]);
  const sortableIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const continuationIds = useMemo(() => {
    const ids = new Set<string>();
    if (isDesktop) return ids;
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      if (
        row.kind === 'entry' &&
        prev?.kind === 'entry' &&
        prev.entry.skillTypeID === row.entry.skillTypeID &&
        !bandsAt.has(row.id)
      )
        ids.add(row.id);
    });
    return ids;
  }, [rows, bandsAt, isDesktop]);

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
      autoScroll={{ threshold: { x: 0.2, y: 0.25 }, acceleration: 20 }}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div className="rounded-xs border border-line">
          {isDesktop && (columns.perLevelTime || columns.cumulativeTime) && (
            <div
              className={`${eyebrowClassName} flex items-center justify-between gap-2 border-b border-line px-2 py-1`}
            >
              <span className="flex-1" />
              {columns.perLevelTime && <span className={TIME_CELL}>{t('plans.columnTakes')}</span>}
              {columns.cumulativeTime && (
                <span className={TIME_CELL}>{t('plans.columnDoneBy')}</span>
              )}
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
                      reducedMotion={reducedMotion}
                      continuation={continuationIds.has(row.id)}
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
                      reducedMotion={reducedMotion}
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
                      reducedMotion={reducedMotion}
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
