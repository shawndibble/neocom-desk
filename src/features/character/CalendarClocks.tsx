import { useMemo } from 'react';
import { eveTimeOfDay } from '@/lib/eveTime';
import { useTicker } from '@/lib/ticker';
import { MINUTE_MS } from '@/lib/age';

const SECOND_MS = 1_000;

export function CalendarClocks() {
  const now = useTicker(SECOND_MS);
  const minuteIso = new Date(now - (now % MINUTE_MS)).toISOString();
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
