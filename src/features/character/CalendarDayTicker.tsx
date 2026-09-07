/**
 * The phone's Calendar Map: one swipeable row of days instead of a 7x6 grid.
 *
 * A month grid and a list cannot share a 390px viewport — the grid wins the
 * space and the list, which is the thing being read, gets what is left. So on
 * a phone the map collapses to its useful axis: a week of day columns, each
 * with a severity bar and a count, scrolled sideways for the weeks after it.
 *
 * The same `DayLoad` buckets the wide grid reads, sliced rather than
 * re-bucketed — a prefix of the engine's answer cannot disagree with the wider
 * view, which is the rule `CorpDeadlineStrip` already settled on for its own
 * narrow branch.
 */
import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { localMidnight } from '@/engine/character/deadlines';
import type { GridDay } from '@/lib/calendarGrid';
import { SEVERITY_DOT, SEVERITY_LABEL } from './calendarSeverityTone';

export interface CalendarDayTickerProps {
  days: readonly GridDay[];
  loads: Map<number, DayLoad>;
  nowMs: number;
  selectedDayMs: number | null;
  onSelectDay: (dayStartMs: number | null) => void;
}

export function CalendarDayTicker({
  days,
  loads,
  nowMs,
  selectedDayMs,
  onSelectDay,
}: CalendarDayTickerProps) {
  const { t, i18n } = useTranslation();
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const fullDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const todayMs = localMidnight(nowMs);

  return (
    <div
      role="group"
      aria-label={t('calendar.map.label')}
      className="flex gap-1 overflow-x-auto overscroll-x-contain"
    >
      {days.map((day) => {
        const dayStartMs = localMidnight(day.date.getTime());
        const load = loads.get(dayStartMs);
        const isSelected = selectedDayMs === dayStartMs;
        const isPast = dayStartMs < todayMs;
        return (
          <button
            key={day.key}
            type="button"
            aria-pressed={isSelected}
            /* The bar is colour and nothing else, so the name carries the word. */
            aria-label={
              load
                ? t('calendar.map.dayWithLoad', {
                    date: fullDate.format(day.date),
                    count: load.count,
                    severity: t(SEVERITY_LABEL[load.severity]),
                  })
                : t('calendar.map.dayEmpty', { date: fullDate.format(day.date) })
            }
            onClick={() => onSelectDay(isSelected ? null : dayStartMs)}
            className={[
              'flex min-h-11 w-12 shrink-0 flex-col items-center gap-1 rounded-xs border px-1 py-1.5',
              isSelected ? 'border-accent-dim bg-accent/15' : 'border-transparent',
              isPast ? 'calendar-map-past' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className={`text-[0.6875rem] font-semibold tracking-widest uppercase ${
                day.isToday ? 'text-accent' : 'text-text-dim'
              }`}
            >
              {day.isToday ? t('calendar.map.today') : weekday.format(day.date)}
            </span>
            <span
              className={`text-base leading-none font-semibold tabular-nums ${
                day.isToday ? 'text-accent' : isPast ? 'text-text-faint' : 'text-text'
              }`}
            >
              {day.date.getDate()}
            </span>
            {/* Reserved whether or not the day holds anything, so every column lines up. */}
            <span
              aria-hidden="true"
              className={`h-0.5 w-6 rounded-full ${load ? SEVERITY_DOT[load.severity] : ''}`}
            />
            <span className="h-3.5 text-[0.6875rem] leading-3.5 text-text-dim tabular-nums">
              {load ? load.count : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
