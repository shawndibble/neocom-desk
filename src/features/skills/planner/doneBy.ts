import { formatCountdown, stepFinish } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';

/**
 * When this step finishes training, as a calendar date on the chosen clock. Falls back to the
 * running total as a duration when the caller has no wall-clock basis to offer
 * (`startDate` omitted) — the number is still true, just not yet a date.
 */
export function doneByText(
  cumulativeSeconds: number,
  startDate: Date | undefined,
  timeZone?: 'UTC'
): string {
  return startDate === undefined
    ? formatCountdown(cumulativeSeconds)
    : formatLocalDate(stepFinish(cumulativeSeconds, startDate), timeZone);
}
