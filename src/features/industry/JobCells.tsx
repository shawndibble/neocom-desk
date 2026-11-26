import { ProgressBar } from '@/components/ui';
import { useTicker } from '@/lib/ticker';
import { formatDuration } from '@/lib/duration';
import type { IndustryJob } from '@/esi/endpoints';
import { isJobDone, jobProgress, secondsRemaining, JOBS_TICK_MS } from './jobs';

export function JobProgressCell({
  job,
  label,
  tone,
}: {
  job: Pick<IndustryJob, 'start_date' | 'end_date'>;
  label: string;
  tone: 'accent' | 'warning' | 'success';
}) {
  const now = useTicker(JOBS_TICK_MS);
  const progress = Math.round(jobProgress(job, now) * 100);
  return (
    <span className="flex items-center gap-2 max-sm:w-full">
      <ProgressBar
        label={label}
        value={progress}
        tone={tone}
        className="w-16 shrink-0 max-sm:w-auto max-sm:flex-1 sm:w-24"
      />
      <span className="w-8 shrink-0 tabular-nums text-text-dim sm:text-right">{progress}%</span>
    </span>
  );
}

export function JobEndsInCell({
  job,
  doneLabel,
}: {
  job: Pick<IndustryJob, 'end_date'>;
  doneLabel: string;
}) {
  const now = useTicker(JOBS_TICK_MS);
  return isJobDone(job, now) ? doneLabel : formatDuration(secondsRemaining(job, now));
}
