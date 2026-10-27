import { useTranslation } from 'react-i18next';
import { StatChip, StatChips } from '@/components/ui';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import type { QueueView } from './queueView';

/**
 * One line of figures for the whole in-game queue: how long it runs, when it
 * ends, how many levels are in it. No card: it is read-only, so a box would
 * promise a click (DESIGN.md §6c).
 */
export function QueueStrip({ view, nowMs }: { view: QueueView; nowMs: number }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  if (view.skillCount === 0) return null;
  const dated = view.totalSeconds > 0;
  return (
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
            value={formatLocalDate(new Date(nowMs + view.totalSeconds * 1000), timeZone)}
          />
        </>
      )}
      <StatChip label={t('plans.queueStripSkills')} value={view.skillCount} />
    </StatChips>
  );
}
