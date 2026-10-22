import { romanLevel } from '@/engine/projection';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, Disclosure } from '@/components/ui';
import { SkillLink } from '@/features/entities';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import type { QueueEndProjection } from '@/engine/skills/queueStatus';

interface LiveQueueLeadProps {
  projection: QueueEndProjection;
  fetchedAt: Date | null;
  nameFor: (skillTypeID: number) => string;
}

/**
 * The in-game queue's lead, read-only, above the plan rows: the levels that
 * train before the first one this plan lists, so the plan's dates start where
 * they end. Collapsed by default.
 */
export function LiveQueueLead({ projection, fetchedAt, nameFor }: LiveQueueLeadProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [expanded, setExpanded] = useState(false);
  const { queuedLevels, paused, startMs } = projection;

  if (paused) return <p className="text-xs text-text-dim">{t('plans.liveQueuePaused')}</p>;
  if (queuedLevels.length === 0) return null;

  return (
    <Disclosure
      className="border border-line"
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      label={t('plans.liveQueueLead', {
        count: queuedLevels.length,
        date: formatLocalDate(new Date(startMs), timeZone),
      })}
      trailing={fetchedAt ? <DataAgeBadge date={fetchedAt} tooltip={false} /> : undefined}
    >
      {queuedLevels.map((e) => (
        <div key={e.queue_position} className="px-2.5 py-1 text-xs text-text-dim">
          <SkillLink typeId={e.skill_id}>{nameFor(e.skill_id)}</SkillLink>{' '}
          {romanLevel(e.finished_level)}
          {e.finish_date && (
            <span className="ml-2 tabular-nums">
              {formatLocalDate(new Date(e.finish_date), timeZone)}
            </span>
          )}
        </div>
      ))}
    </Disclosure>
  );
}
