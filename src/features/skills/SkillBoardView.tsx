import { useTranslation } from 'react-i18next';
import type { ReactNode, RefCallback } from 'react';
import { SkillBar, Tooltip } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { cx } from '@/lib/cx';
import { progressToNextLevel } from '@/engine/sp';
import { SkillLink } from '@/features/entities/EntityLink';
import type { BoardGroup, BoardSkill } from './skillBoard';
import { skillGroupIcon } from './skillGroupIcon';

/**
 * One skill group on the Trained board: its icon, a bar split trained / queued
 * and "trained / total". A button that expands the group's skills in place.
 * While a search is active `matchCount` replaces the total and the tile stops
 * toggling (the search already expands what matches).
 */
export function GroupTile({
  group,
  expanded,
  matchCount,
  trailing,
  controlsId,
  onToggle,
}: {
  group: BoardGroup;
  expanded: boolean;
  matchCount?: number;
  /** The training chip, when the skill in training is in this group. */
  trailing?: ReactNode;
  controlsId: string;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const trainedShare = group.total === 0 ? 0 : (group.trained / group.total) * 100;
  const queuedShare = group.total === 0 ? 0 : (group.queued / group.total) * 100;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controlsId}
      disabled={matchCount !== undefined}
      onClick={onToggle}
      className={cx(
        'flex min-h-11 w-full scroll-mt-14 items-center gap-3 rounded-xs border border-line bg-panel/85 p-3 text-left disabled:hover:bg-panel/85',
        rowInteractiveClassName,
        focusRingInsetClassName,
        expanded && 'border-accent-dim'
      )}
    >
      <span className="shrink-0 text-accent">{skillGroupIcon(group.groupName)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Caret expanded={expanded} />
            <span className="truncate">{group.groupName}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            {trailing}
            <span className="text-xs text-text-dim tabular-nums">
              {matchCount !== undefined
                ? t('skills.board.tileMatches', { count: matchCount })
                : t('skills.board.trainedOfTotal', { trained: group.trained, total: group.total })}
            </span>
          </span>
        </span>
        <span aria-hidden="true" className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-line">
          <span className="bg-accent" style={{ width: `${trainedShare}%` }} />
          <span className="bg-warning/70" style={{ width: `${queuedShare}%` }} />
        </span>
      </span>
    </button>
  );
}

/** "Need book": the skill is not in the character's skills, so its book is still to buy and inject. */
export function NeedBookMarker() {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 rounded-xs border border-warning/50 px-1.5 py-0.5 text-[0.6875rem] whitespace-nowrap text-warning">
      {t('skills.board.needBook')}
    </span>
  );
}

/**
 * One skill row: the name opens the skill info modal (a real link), the rest of
 * the row opens the inspector. Two siblings rather than a link inside a button.
 */
export function SkillBoardRow({
  skill,
  selected,
  plannedLevel,
  trainingChip,
  buttonRef,
  onSelect,
}: {
  skill: BoardSkill;
  selected: boolean;
  /** A Skill Plan's target for this skill; the queued level wins when higher. */
  plannedLevel: number | null;
  trainingChip?: ReactNode;
  buttonRef: RefCallback<HTMLButtonElement>;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const progress =
    skill.sp === null ? null : progressToNextLevel(skill.rank, skill.level, skill.sp);
  const planned = Math.max(skill.queuedLevel ?? 0, plannedLevel ?? 0);
  const name = (
    <SkillLink
      typeId={skill.skillTypeID}
      className="line-clamp-2 min-w-0 text-xs sm:line-clamp-none sm:truncate"
    >
      {skill.name}
    </SkillLink>
  );
  return (
    <li
      className={cx(
        'flex items-center gap-2 text-xs',
        selected ? selectedRowClassName : 'border-l-2 border-l-transparent'
      )}
    >
      {/* Below `sm` the chip drops under the name rather than squeezing it. */}
      <span className="flex min-w-0 flex-col items-start gap-0.5 py-1.5 sm:flex-row sm:items-center sm:gap-2">
        {skill.description ? <Tooltip content={skill.description}>{name}</Tooltip> : name}
        {trainingChip}
      </span>
      <button
        type="button"
        ref={buttonRef}
        aria-label={skill.name}
        aria-pressed={selected}
        onClick={onSelect}
        className={cx(
          tappableRowClassName,
          'flex min-w-0 flex-1 scroll-mt-14 items-center justify-end gap-3 py-1.5 text-left',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <span className="hidden text-text-dim tabular-nums sm:inline">×{skill.rank}</span>
        {skill.injected ? (
          <span className="text-text-dim tabular-nums">
            {skill.queuedLevel !== null
              ? t('skills.board.levelQueued', { level: skill.level, queued: skill.queuedLevel })
              : skill.level}
          </span>
        ) : (
          <NeedBookMarker />
        )}
        <SkillBar
          level={skill.level}
          progress={progress}
          plannedLevel={planned > skill.level ? planned : null}
        />
        <span className="hidden w-20 shrink-0 text-right text-text-dim tabular-nums sm:inline">
          {!skill.injected
            ? null
            : skill.sp === null
              ? t('common.unknown')
              : t('skills.sp', { value: skill.sp.toLocaleString() })}
        </span>
      </button>
    </li>
  );
}
