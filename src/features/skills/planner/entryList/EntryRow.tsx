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
  /** Step indices a live Booster speeds up — the row's own mark and its per-level marks both read this. */
  boostedSteps: ReadonlySet<number> | undefined;
  /** Step indices above the Alpha skill cap; empty unless the Character is Alpha. */
  alphaCappedSteps: ReadonlySet<number> | undefined;
  /** When training begins, for this row's finish date. Undefined when there's no wall-clock basis to offer. */
  startDate: Date | undefined;
  columns: ColumnVisibility;
  isDesktop: boolean;
  onRemove: (skillTypeID: number, targetLevel: number) => void;
  /** Runs as a skill name is clicked, before the link navigates — carries this plan's entries to the modal. */
  onStageSkillDetail: (skillTypeID: number) => void;
  /**
   * Undefined when the row is freely removable. Set to a plain-language
   * reason (naming what still needs it) when some other entry — a later
   * level of this skill, or a dependent skill's own entry — would pull this
   * exact level straight back in as a dimmed prereq row the instant it's
   * removed (`findRemovalBlockers`). The remove button disables rather than
   * accepting a click that silently undoes itself.
   */
  removalBlockedReason: (skillTypeID: number, targetLevel: number) => string | undefined;
  onSetPriority: (skillTypeID: number, priority: PlanPriority) => void;
  /**
   * Set when this row IS the in-game queue's currently-training level (#1701
   * follow-up) — it contributes zero of its own scheduled steps (already
   * credited as trained by `startDate`), so its "Takes" cell reads that
   * level's real remaining time instead of a bare, misleading "0m".
   */
  pinnedInProgress: PinnedInProgressEntry | null | undefined;
  /** This row's Plan Milestone (GLOSSARY.md), if one is anchored to its skill/level. */
  milestoneStatus: MilestoneStatus | undefined;
  onAddMilestone: (skillTypeID: number, targetLevel: number) => void;
  onRenameMilestone: (milestoneId: string) => void;
  onRemoveMilestone: (milestoneId: string) => void;
}

/**
 * Memoized (#408): PlanEditor re-renders on state that has nothing to do
 * with any given row (dropError, an unrelated marker's editor, the export
 * menu, another row's own expansion) — `React.memo` skips this row entirely
 * when none of its own props changed. Only holds if the callback props below
 * are themselves stable (`useCallback`'d at the PlanEditor/EntryList call
 * sites) — an inline arrow recreated every render would defeat this the same
 * way an unstable dependency defeats `useMemo`.
 */
export const EntryRow = memo(function EntryRow({
  row,
  name,
  attributes,
  boostedSteps,
  alphaCappedSteps,
  startDate,
  columns,
  isDesktop,
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
  // The dialogs these items open wait for the menu to hand focus back to ⋮.
  const menu = useOpenAfterMenu();
  const { entry, stepIndices } = row;
  // A row credited as already-trained by the plan's start (`row.seconds: 0`)
  // because it IS the in-game queue's currently-training level (#1701
  // follow-up) reads that level's real remaining time instead of a bare,
  // misleading "0m" — straight off the ESI queue's own `finish_date`, not
  // the plan's (zeroed) schedule.
  const takesSeconds = pinnedInProgress?.id === row.id ? pinnedInProgress.seconds : row.seconds;
  const boosted = stepIndices.some((i) => boostedSteps?.has(i) ?? false);
  const alphaCapped = stepIndices.some((i) => alphaCappedSteps?.has(i) ?? false);
  // Names the level, not just the skill: a plan holds one row per level, so
  // two rows of the same skill would otherwise offer two buttons with the
  // identical accessible name "Remove Gunnery".
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

  // One row trains one level (reorder.ts), so the row says which level it is
  // and there is nothing left to disclose — the caret and the per-level
  // breakdown it opened (#254) both retired with the level ranges that made
  // them necessary.
  const nameSpan = (
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
      {/* Desktop keeps the mark on line one (#114's fixed columns leave it
          room); below `md` it moves to the meta line instead, so a long
          milestone name can't squeeze the skill name off this row. */}
      {isDesktop && milestoneStatus && <MilestoneMark status={milestoneStatus} />}
    </span>
  );

  const attributeBadge =
    columns.attributePair && attributes ? (
      <AttributePairBadge primary={attributes.primary} secondary={attributes.secondary} />
    ) : null;

  const priorityControl = columns.priority ? (
    <PriorityPill
      skillTypeID={entry.skillTypeID}
      name={rowLabel}
      priority={entry.priority ?? 'normal'}
      onSetPriority={onSetPriority}
      touchTarget={!isDesktop}
    />
  ) : null;

  const blockedReason = removalBlockedReason(entry.skillTypeID, entry.targetLevel);
  // One ⋮ ends the row (right-click and touch-and-hold open the same menu):
  // the milestone's actions, then Remove as the danger item. A blocked removal
  // is an `aria-disabled` item with a tap-reachable reason (`DisabledMenuItem`)
  // rather than a click that silently undoes itself.
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

  /**
   * Below `md` every optional value drops to one dim meta line under the name
   * (#114), including the finish date — which used to ride line one and eat
   * the width the skill name and its Booster mark needed. Line one is now the
   * row's identity and its one action, nothing else, and the row still folds
   * back to a single line when the user turns every optional column off.
   */
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
        isDragging ? 'bg-panel-2' : ''
      }`}
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
