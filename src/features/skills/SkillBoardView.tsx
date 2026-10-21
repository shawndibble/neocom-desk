import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { SkillBar, Tooltip } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { cx } from '@/lib/cx';
import { progressToNextLevel } from '@/engine/skills/sp';
import { SkillLink } from '@/features/entities/EntityLink';
import { useSkillDetailModal } from '@/stores/skillDetailModal';
import type { BoardGroup, BoardSkill } from './skillBoard';
import { skillGroupIcon } from './skillGroupIcon';
import { formatNumber } from '@/lib/numberLocale';

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
  onToggle,
}: {
  group: BoardGroup;
  expanded: boolean;
  matchCount?: number;
  /** The training chip, when the skill in training is in this group. */
  trailing?: ReactNode;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const trainedShare = group.total === 0 ? 0 : (group.trained / group.total) * 100;
  // A trained skill with a higher level queued is in both counts; the queued
  // segment only ever fills the untrained remainder, so the bar never overshoots.
  const queuedShare =
    group.total === 0 ? 0 : Math.min((group.queued / group.total) * 100, 100 - trainedShare);
  return (
    <button
      type="button"
      aria-expanded={expanded}
      // Not `disabled`: that would drop the tile from the tab order while a
      // search is open. The search already expands what matches, so a toggle is a no-op.
      aria-disabled={matchCount !== undefined || undefined}
      onClick={onToggle}
      className={cx(
        'flex min-h-11 w-full scroll-mt-14 items-center gap-3 rounded-xs border border-line bg-panel/85 p-3 text-left aria-disabled:cursor-default',
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
function NeedBookMarker() {
  const { t } = useTranslation();
  return (
    <span className="shrink-0 rounded-xs border border-warning/50 px-1.5 py-0.5 text-[0.6875rem] whitespace-nowrap text-warning">
      {t('skills.board.needBook')}
    </span>
  );
}

/** One skill row: name links to the skill Show info, rest of the row opens it too. Siblings, not a link inside a button. */
export function SkillBoardRow({
  skill,
  plannedLevel,
  trainingChip,
}: {
  skill: BoardSkill;
  /** A Skill Plan's target for this skill; the queued level wins when higher. */
  plannedLevel: number | null;
  trainingChip?: ReactNode;
}) {
  const { t } = useTranslation();
  const { open: openSkillDetail } = useSkillDetailModal();
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
    <li className="flex items-center gap-2 text-xs">
      {/* Below `sm` the chip drops under the name rather than squeezing it. */}
      <span className="flex min-w-0 flex-col items-start gap-0.5 py-1.5 sm:flex-row sm:items-center sm:gap-2">
        {skill.description ? <Tooltip content={skill.description}>{name}</Tooltip> : name}
        {trainingChip}
      </span>
      <button
        type="button"
        aria-label={skill.name}
        onClick={() => openSkillDetail(skill.skillTypeID)}
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
              : t('skills.sp', { value: formatNumber(skill.sp) })}
        </span>
      </button>
    </li>
  );
}
