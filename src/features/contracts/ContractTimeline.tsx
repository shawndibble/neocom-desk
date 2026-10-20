/**
 * A contract's progress as a row of steps (Issued, Accepted, Completed — or
 * Waiting and then the expiry), in place of separate date rows. Presentational
 * over `engine/contracts/contractTimeline`.
 *
 * A step that has not happened reads "Waiting" in text, and the bar above it
 * is only a second cue: colour never carries the state alone (WCAG 1.4.1).
 */
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { cx } from '@/lib/cx';
import type { TimelineStep, TimelineStepKey } from '@/engine/contracts/contractTimeline';

const LABEL_KEY: Record<TimelineStepKey, string> = {
  issued: 'contractDetail.timelineIssued',
  accepted: 'contractDetail.timelineAccepted',
  completed: 'contractDetail.timelineCompleted',
  expires: 'contractDetail.timelineExpires',
};

export function ContractTimeline({ steps }: { steps: readonly TimelineStep[] }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const when = (step: TimelineStep): string => {
    if (step.sameMinuteAsPrevious) return t('contractDetail.timelineSameMinute');
    if (step.atMs === null) return t('contractDetail.timelineWaiting');
    return formatTimestamp(new Date(step.atMs), timeZone);
  };
  return (
    <ol aria-label={t('contractDetail.timelineLabel')} className="flex gap-2">
      {steps.map((step) => (
        <li key={step.key} className="min-w-0 flex-1">
          <span
            aria-hidden
            className={cx('mb-1.5 block h-1 rounded-full', step.done ? 'bg-accent' : 'bg-line')}
          />
          <b className={cx('block font-semibold', !step.done && 'text-text-dim')}>
            {t(LABEL_KEY[step.key])}
          </b>
          <span className="block tabular-nums text-text-dim">{when(step)}</span>
        </li>
      ))}
    </ol>
  );
}
