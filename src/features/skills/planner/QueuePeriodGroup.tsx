import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import { SkillLink } from '@/features/entities';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { skillGroupIcon } from '../skillGroupIcon';
import type { SkillCatalog } from '../skillMap';
import type { SkillQueueStatus } from '@/engine/skills/queueStatus';
import type { QueuePeriodGroup as Group, QueueRowView } from './queueView';

const BADGE_STYLE: Partial<Record<SkillQueueStatus, string>> = {
  completed: 'bg-success/15 text-success',
  paused: 'bg-warning/15 text-warning',
};

const BADGE_KEY: Partial<Record<SkillQueueStatus, string>> = {
  completed: 'plans.queueDoneBadge',
  paused: 'plans.queuePausedBadge',
};

interface RowProps {
  row: Pick<QueueRowView, 'entry' | 'status' | 'secondsRemaining'> & {
    durationSeconds?: number | null;
  };
  catalog: SkillCatalog;
  nowMs: number;
}

/** One queued level: its skill and group, how long it adds, and when it finishes. */
function QueueRow({ row, catalog, nowMs }: RowProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const { entry, status, secondsRemaining, durationSeconds } = row;
  const skill = catalog.bySkillTypeID.get(entry.skill_id);
  const badgeKey = BADGE_KEY[status];
  return (
    <li className="flex items-center gap-3 border-t border-line px-3 py-2.5 first:border-t-0">
      <span aria-hidden className="shrink-0 text-text-dim">
        {skillGroupIcon(skill?.groupName ?? '')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <SkillLink typeId={entry.skill_id}>{skill?.name ?? `#${entry.skill_id}`}</SkillLink>{' '}
          {romanLevel(entry.finished_level)}
        </div>
        {skill?.groupName && (
          <div className="truncate text-xs text-text-dim">{skill.groupName}</div>
        )}
      </div>
      {badgeKey && (
        <span
          className={`rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase ${BADGE_STYLE[status] ?? ''}`}
        >
          {t(badgeKey)}
        </span>
      )}
      {secondsRemaining !== null && (
        <div className="shrink-0 text-right tabular-nums">
          <div className="text-sm text-text">{formatCountdown(durationSeconds ?? 0)}</div>
          <div className="text-xs text-text-dim">
            {formatLocalDate(new Date(nowMs + secondsRemaining * 1000), timeZone)}
          </div>
        </div>
      )}
    </li>
  );
}

function periodLabel(t: TFunction, group: Group, nowMs: number, timeZone?: 'UTC'): string {
  if (group.id === 'week') return t('plans.periodWeek');
  if (group.id === 'month' || !group.monthStart) return t('plans.periodMonth');
  // `monthStart` is UTC midnight of the month's first, so name it in UTC; the
  // current year is read on the chosen clock to match how the group was filed.
  const currentYear = Number(formatLocalDate(new Date(nowMs), timeZone).slice(0, 4));
  const sameYear = group.monthStart.getUTCFullYear() === currentYear;
  return group.monthStart.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

interface QueuePeriodGroupProps {
  group: Group;
  catalog: SkillCatalog;
  nowMs: number;
}

/** Levels finishing in one stretch of the queue, headed by how many and how long. */
export function QueuePeriodGroup({ group, catalog, nowMs }: QueuePeriodGroupProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-xs font-semibold tracking-wide text-text-dim uppercase">
          {periodLabel(t, group, nowMs, timeZone)}
        </h3>
        <span className="text-xs text-text-dim tabular-nums">
          {t('plans.periodSummary', {
            count: group.rows.length,
            duration: formatCountdown(group.totalSeconds),
          })}
        </span>
      </div>
      <ul className="rounded-xs border border-line bg-panel">
        {group.rows.map((row) => (
          <QueueRow
            key={`${row.entry.skill_id}-${row.entry.finished_level}-${row.entry.queue_position}`}
            row={row}
            catalog={catalog}
            nowMs={nowMs}
          />
        ))}
      </ul>
    </section>
  );
}

/** Levels that have no place on the clock: finished-but-unapplied, or paused. */
export function QueueLooseRows({
  title,
  rows,
  catalog,
  nowMs,
}: {
  title: string;
  rows: RowProps['row'][];
  catalog: SkillCatalog;
  nowMs: number;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-text-dim uppercase">
        {title}
      </h3>
      <ul className="rounded-xs border border-line bg-panel">
        {rows.map((row) => (
          <QueueRow
            key={`${row.entry.skill_id}-${row.entry.finished_level}-${row.entry.queue_position}`}
            row={row}
            catalog={catalog}
            nowMs={nowMs}
          />
        ))}
      </ul>
    </section>
  );
}

/** Finished-but-unapplied levels: one narrow line each, clumped, no header. */
export function QueueFinishedRows({
  rows,
  catalog,
}: {
  rows: RowProps['row'][];
  catalog: SkillCatalog;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;
  return (
    <ul className="rounded-xs border border-line bg-panel">
      {rows.map((row) => {
        const { entry } = row;
        const skill = catalog.bySkillTypeID.get(entry.skill_id);
        return (
          <li
            key={`${entry.skill_id}-${entry.finished_level}-${entry.queue_position}`}
            className="flex items-center gap-2 border-t border-line px-3 py-1 first:border-t-0"
          >
            <span aria-hidden className="shrink-0 text-text-dim">
              {skillGroupIcon(skill?.groupName ?? '')}
            </span>
            <div className="min-w-0 flex-1 truncate text-sm">
              <SkillLink typeId={entry.skill_id}>{skill?.name ?? `#${entry.skill_id}`}</SkillLink>{' '}
              {romanLevel(entry.finished_level)}
            </div>
            <span
              className={`rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase ${BADGE_STYLE.completed}`}
            >
              {t(BADGE_KEY.completed as string)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
