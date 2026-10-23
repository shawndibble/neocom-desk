/**
 * The Calendar's clock strip: the pilot's local time on the left, EVE time (UTC)
 * on the right. A phone has no room for both, so it keeps EVE time alone, the
 * zone every event time is read against.
 */
import { useTranslation } from 'react-i18next';
import { eveClock } from '@/engine/eveTime';
import { useTicker } from '@/lib/ticker';

const SECOND_MS = 1_000;

export function CalendarClocks() {
  const { t, i18n } = useTranslation();
  const now = useTicker(SECOND_MS);
  const local = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return (
    <div className="flex items-baseline justify-between gap-3 tabular-nums">
      <div className="max-md:hidden">
        <span className="mr-1.5 text-[0.6875rem] text-text-dim">{t('calendar.clocks.local')}</span>
        <time dateTime={new Date(now).toISOString()} className="text-sm text-text">
          {local}
        </time>
      </div>
      <div className="max-md:w-full max-md:text-center">
        <span className="mr-1.5 text-[0.6875rem] text-text-dim">{t('calendar.clocks.eve')}</span>
        <time dateTime={new Date(now).toISOString()} className="text-sm text-text">
          {eveClock(now)}
        </time>
      </div>
    </div>
  );
}
