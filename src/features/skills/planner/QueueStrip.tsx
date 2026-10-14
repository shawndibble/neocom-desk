import { useTranslation } from 'react-i18next';
import { DataAgeBadge, StatChip, StatChips } from '@/components/ui';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import type { QueueView } from './queueView';

/**
 * One line of figures for the whole in-game queue: how long it runs, when it
 * ends, how many levels are in it. No card: it is read-only, so a box would
 * promise a click (DESIGN.md §6c).
 */
export function QueueStrip({
  view,
  nowMs,
  fetchedAt,
}: {
  view: QueueView;
  nowMs: number;
  fetchedAt?: Date;
}) {
  const { t } = useTranslation();
  if (view.skillCount === 0) return null;
  const dated = view.totalSeconds > 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <StatChips>
        {dated && (
          <>
            <StatChip
              label={t('plans.queueStripLength')}
              value={formatCountdown(view.totalSeconds)}
              emphasis
            />
            <StatChip
              label={t('plans.queueStripEnds')}
              value={formatLocalDate(new Date(nowMs + view.totalSeconds * 1000))}
            />
          </>
        )}
        <StatChip label={t('plans.queueStripSkills')} value={view.skillCount} />
      </StatChips>
      {fetchedAt && <DataAgeBadge date={fetchedAt} />}
    </div>
  );
}
