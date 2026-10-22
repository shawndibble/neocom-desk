import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { focusRingClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import type { MilestoneState, MilestoneStatus } from '@/engine/skills/skillPlanMilestones';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';

/** An inline row glyph: shared by entry and prereq rows. */
function RowMark({ label, tone, path }: { label: string; tone: string; path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label={label}
      role="img"
      className={`ml-1 inline-block size-3 align-[-0.125em] ${tone}`}
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function BoosterMark() {
  const { t } = useTranslation();
  return (
    <RowMark
      label={t('plans.boosterAffects')}
      tone="text-accent"
      path="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
    />
  );
}

/** A level an Alpha clone cannot train. */
export function AlphaCapMark() {
  const { t } = useTranslation();
  return (
    <RowMark
      label={t('plans.alphaCapped')}
      tone="text-warning"
      path="M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 8h2v2h-2v-2Z"
    />
  );
}

/** i18n key for a milestone's state, e.g. 'reached' -> 'plans.milestone.reached'. */
function milestoneStateKey(state: MilestoneState): string {
  return `plans.milestone.${state}`;
}

/**
 * Plan Milestone (GLOSSARY.md): a named goal ("Fly Loki") pinned to this row's
 * skill level. Decorative only — sits beside the name so a flagged row reads
 * as one at a glance; the Add/Rename/Remove actions live in the row's own
 * the row's ⋮ menu instead, so this never has to fight the name's own
 * `truncate` for click area.
 */
export function MilestoneMark({ status }: { status: MilestoneStatus }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const dateText =
    status.state === 'projected' && status.finish
      ? status.milestone.fittingId !== undefined
        ? t('plans.fitGoal.flyable', { date: formatLocalDate(status.finish, timeZone) })
        : formatLocalDate(status.finish, timeZone)
      : t(milestoneStateKey(status.state));
  return (
    <Tooltip content={status.milestone.name}>
      <span
        tabIndex={0}
        className={cx(
          'ml-2 inline-flex shrink-0 items-center gap-1 rounded-xs px-1 text-[0.6875rem] text-text-dim',
          focusRingClassName
        )}
      >
        <Icon.Milestone size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        <span className="max-w-[8rem] truncate">{status.milestone.name}</span>
        <span className="tabular-nums">{dateText}</span>
      </span>
    </Tooltip>
  );
}
