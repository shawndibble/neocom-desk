import { formatCountdown, stepFinish } from '@/lib/duration';
import { formatLocalDate } from '@/lib/localDate';

export function doneByText(
  cumulativeSeconds: number,
  startDate: Date | undefined,
  timeZone?: 'UTC'
): string {
  return startDate === undefined
    ? formatCountdown(cumulativeSeconds)
    : formatLocalDate(stepFinish(cumulativeSeconds, startDate), timeZone);
}
