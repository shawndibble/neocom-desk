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
  expired: 'contractDetail.timelineExpired',
  cancelled: 'contractDetail.timelineCancelled',
  deleted: 'contractDetail.timelineDeleted',
  rejected: 'contractDetail.timelineRejected',
  failed: 'contractDetail.timelineFailed',
  reversed: 'contractDetail.timelineReversed',
};

function barClassName(step: TimelineStep): string {
  if (step.key === 'rejected' || step.key === 'failed' || step.key === 'reversed') {
    return 'bg-danger';
  }
  if (step.key === 'cancelled' || step.key === 'deleted' || step.key === 'expired') {
    return 'bg-text-dim';
  }
  return step.done ? 'bg-accent' : 'bg-line';
}

export function ContractTimeline({ steps }: { steps: readonly TimelineStep[] }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const when = (step: TimelineStep): string | null => {
    if (step.sameMinuteAsPrevious) return t('contractDetail.timelineSameMinute');
    if (step.atMs === null) return step.done ? null : t('contractDetail.timelineWaiting');
    return formatTimestamp(new Date(step.atMs), timeZone);
  };
  return (
    <ol aria-label={t('contractDetail.timelineLabel')} className="flex gap-2">
      {steps.map((step) => (
        <li key={step.key} className="min-w-0 flex-1">
          <span aria-hidden className={cx('mb-1.5 block h-1 rounded-full', barClassName(step))} />
          <b className={cx('block font-semibold', !step.done && 'text-text-dim')}>
            {t(LABEL_KEY[step.key])}
          </b>
          {when(step) !== null && (
            <span className="block tabular-nums text-text-dim">{when(step)}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
