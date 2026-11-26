import { romanLevel } from '@/engine/projection';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DisabledMenuItem,
  MenuItem,
  MenuSeparator,
  RowActionsMenu,
  RowMoreActions,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MilestoneStatus } from '@/engine/skills/skillPlanMilestones';
import type { PlanPriority } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { useTimeZone } from '@/lib/timeFormat';
import { SkillLink } from '@/features/entities';
import { doneByText } from '../doneBy';
import type { AttributePair } from '../attributePairBands';
import type { ColumnVisibility } from '../columnPreference';
import type { MergedRow, PinnedInProgressEntry } from '../queueRows';
import { formatLevelLabel } from '../rowAnnouncer';
import { AttributePairBadge, MetaValue, PriorityPill, TimeCell } from './cells';
import { AlphaCapMark, BoosterMark, MilestoneMark } from './marks';
import { GRIP_BUTTON, NAME_CELL, useRowSortable } from './rowChrome';

interface EntryRowProps {
  row: Extract<MergedRow, { kind: 'entry' }>;
  name: string;
  attributes: AttributePair | undefined;
  boostedSteps: ReadonlySet<number> | undefined;
  alphaCappedSteps: ReadonlySet<number> | undefined;
  startDate: Date | undefined;
  columns: ColumnVisibility;
  isDesktop: boolean;
  continuation?: boolean;
  onRemove: (skillTypeID: number, targetLevel: number) => void;
  onStageSkillDetail: (skillTypeID: number) => void;
  removalBlockedReason: (skillTypeID: number, targetLevel: number) => string | undefined;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  pinnedInProgress: PinnedInProgressEntry | null | undefined;
  milestoneStatus: MilestoneStatus | undefined;
  onAddMilestone: (skillTypeID: number, targetLevel: number) => void;
  onRenameMilestone: (milestoneId: string) => void;
  onRemoveMilestone: (milestoneId: string) => void;
}

export const EntryRow = memo(function EntryRow({
  row,
  name,
  attributes,
  boostedSteps,
  alphaCappedSteps,
  startDate,
  columns,
  isDesktop,
  continuation = false,
  onRemove,
  onStageSkillDetail,
  removalBlockedReason,
  onSetPriority,
  pinnedInProgress,
  milestoneStatus,
  onAddMilestone,
  onRenameMilestone,
  onRemoveMilestone,
}: EntryRowProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { setNodeRef, style, handleProps, isDragging } = useRowSortable(row.id);
  const menu = useOpenAfterMenu();
  const { entry, stepIndices } = row;
  const takesSeconds = pinnedInProgress?.id === row.id ? pinnedInProgress.seconds : row.seconds;
  const boosted = stepIndices.some((i) => boostedSteps?.has(i) ?? false);
  const alphaCapped = stepIndices.some((i) => alphaCappedSteps?.has(i) ?? false);
  const rowLabel = formatLevelLabel(name, entry.targetLevel);

  const dragHandle = (
    <button
      type="button"
      {...handleProps}
      aria-label={t('plans.reorderEntry', { name: rowLabel })}
      className={GRIP_BUTTON}
    >
      <Icon.DragHandle />
    </button>
  );

  const nameSpan = continuation ? (
    <span className={NAME_CELL}>
      <span className="sr-only">{name} </span>
      <span className="shrink-0">
        <span>{romanLevel(entry.targetLevel)}</span>
        {boosted && <BoosterMark />}
        {alphaCapped && <AlphaCapMark />}
      </span>
    </span>
  ) : (
    <span className={NAME_CELL}>
      <SkillLink
        typeId={entry.skillTypeID}
        onClick={() => onStageSkillDetail(entry.skillTypeID)}
        className="truncate lg:scroll-mt-40"
      >
        {name}
      </SkillLink>{' '}
      <span className="shrink-0">
        <span>{romanLevel(entry.targetLevel)}</span>
        {boosted && <BoosterMark />}
        {alphaCapped && <AlphaCapMark />}
      </span>
      {isDesktop && milestoneStatus && <MilestoneMark status={milestoneStatus} />}
    </span>
  );

  const attributeBadge =
    columns.attributePair && attributes && !continuation ? (
      <AttributePairBadge primary={attributes.primary} secondary={attributes.secondary} />
    ) : null;

  const priorityControl =
    columns.priority && !continuation ? (
      <PriorityPill
        skillTypeID={entry.skillTypeID}
        name={rowLabel}
        priority={entry.priority ?? 'normal'}
        onSetPriority={onSetPriority}
        touchTarget={!isDesktop}
      />
    ) : null;

  const blockedReason = removalBlockedReason(entry.skillTypeID, entry.targetLevel);
  const rowMenuItems = (
    <>
      {milestoneStatus ? (
        <>
          {milestoneStatus.milestone.fittingId === undefined && (
            <MenuItem
              onSelect={() => menu.run(() => onRenameMilestone(milestoneStatus.milestone.id))}
            >
              {t('plans.milestone.rename')}
            </MenuItem>
          )}
          <MenuItem onSelect={() => onRemoveMilestone(milestoneStatus.milestone.id)}>
            {t('plans.milestone.remove')}
          </MenuItem>
        </>
      ) : (
        <MenuItem
          onSelect={() => menu.run(() => onAddMilestone(entry.skillTypeID, entry.targetLevel))}
        >
          {t('plans.milestone.add')}
        </MenuItem>
      )}
      <MenuSeparator />
      {blockedReason ? (
        <DisabledMenuItem reason={blockedReason}>
          {t('plans.removeEntry', { name: rowLabel })}
        </DisabledMenuItem>
      ) : (
        <MenuItem
          className="text-danger"
          onSelect={() => menu.run(() => onRemove(entry.skillTypeID, entry.targetLevel))}
        >
          {t('plans.removeEntry', { name: rowLabel })}
        </MenuItem>
      )}
    </>
  );

  const metaLine =
    attributeBadge ||
    priorityControl ||
    columns.perLevelTime ||
    columns.cumulativeTime ||
    milestoneStatus ? (
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[0.6875rem] text-text-dim">
        {attributeBadge}
        {priorityControl}
        {columns.perLevelTime && (
          <MetaValue label={t('plans.columnTakes')} value={formatCountdown(takesSeconds)} />
        )}
        {columns.cumulativeTime && (
          <MetaValue
            label={t('plans.columnDoneBy')}
            value={doneByText(row.cumulativeSeconds, startDate, timeZone)}
          />
        )}
        {milestoneStatus && <MilestoneMark status={milestoneStatus} />}
      </div>
    ) : null;

  return (
    <li
      id={`plan-entry-${row.id}`}
      ref={setNodeRef}
      style={style}
      className={`border-b border-line px-2 py-1.5 text-xs last:border-b-0 ${
        continuation ? 'ml-6 border-l py-1' : ''
      } ${isDragging ? 'bg-panel-2' : ''}`}
    >
      <RowActionsMenu name={rowLabel} items={rowMenuItems} onCloseAutoFocus={menu.onCloseAutoFocus}>
        <div>
          {isDesktop ? (
            <div className="flex items-center justify-between gap-2">
              {dragHandle}
              {nameSpan}
              {attributeBadge}
              {priorityControl}
              {columns.perLevelTime && (
                <TimeCell
                  value={formatCountdown(takesSeconds)}
                  dim
                  label={t('plans.columnTakes')}
                />
              )}
              {columns.cumulativeTime && (
                <TimeCell
                  value={doneByText(row.cumulativeSeconds, startDate, timeZone)}
                  label={t('plans.columnDoneBy')}
                />
              )}
              <RowMoreActions className="lg:scroll-mt-40" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                {dragHandle}
                {nameSpan}
                <RowMoreActions className="lg:scroll-mt-40" />
              </div>
              {metaLine}
            </>
          )}
        </div>
      </RowActionsMenu>
    </li>
  );
});
