import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataAgeBadge, Disclosure } from '@/components/ui';
import { formatLocalDate } from '@/lib/localDate';
import type { QueueEndProjection } from '@/features/skills/queueStatus';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

interface LiveQueueLeadProps {
  projection: QueueEndProjection;
  fetchedAt: Date | null;
  nameFor: (skillTypeID: number) => string;
}

/**
 * The in-game queue, read-only, above the plan rows: it trains before the
 * plan does, so the plan's dates start where it ends. Collapsed by default.
 */
export function LiveQueueLead({ projection, fetchedAt, nameFor }: LiveQueueLeadProps) {
  const { t } = useTranslation();
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
        date: formatLocalDate(new Date(startMs)),
      })}
      trailing={fetchedAt ? <DataAgeBadge date={fetchedAt} /> : undefined}
    >
      {queuedLevels.map((e) => (
        <div key={e.queue_position} className="px-2.5 py-1 text-xs text-text-dim">
          {nameFor(e.skill_id)} {ROMAN[e.finished_level - 1]}
          {e.finish_date && (
            <span className="ml-2 tabular-nums">{formatLocalDate(new Date(e.finish_date))}</span>
          )}
        </div>
      ))}
    </Disclosure>
  );
}
