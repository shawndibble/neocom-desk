/**
 * The Calendar's clock strip: the pilot's local time on the left (their own
 * hour cycle, with the zone), EVE time (UTC, 24-hour) on the right. A phone has
 * no room for both, so it keeps EVE time alone, the zone every event time is
 * read against.
 */
import { useMemo } from 'react';
import { eveTimeOfDay } from '@/lib/eveTime';
import { useTicker } from '@/lib/ticker';
import { MINUTE_MS } from '@/lib/age';

const SECOND_MS = 1_000;

export function CalendarClocks() {
  const now = useTicker(SECOND_MS);
  // Both clocks show whole minutes, so the machine-readable value must not move each second.
  const minuteIso = new Date(now - (now % MINUTE_MS)).toISOString();
  // No locale and no hourCycle: the browser's own 12 or 24 hour habit decides.
  const localFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }),
    []
  );
  const local = localFormat.format(now);

  return (
    <div className="flex items-baseline justify-between gap-3 text-sm text-text tabular-nums">
      <time dateTime={minuteIso} className="max-md:hidden">
        {local}
      </time>
      <time dateTime={minuteIso} className="max-md:w-full max-md:text-center">
        {eveTimeOfDay(now)} EVE
      </time>
    </div>
  );
}
