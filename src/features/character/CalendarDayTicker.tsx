import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { cellDayStart, dayStart } from '@/engine/localDay';
import { useTimeZone } from '@/lib/timeFormat';
import type { GridDay } from '@/lib/calendarGrid';
import { cx } from '@/lib/cx';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { kindSegmentClassName } from '@/components/ui/kindTone';
import { useDayLoadLabel } from './dayLoadLabel';

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
  const dayLabel = useDayLoadLabel();
  const zone = useTimeZone();
  const todayMs = dayStart(nowMs, zone);

  return (
    <div
      role="group"
      aria-label={t('calendar.map.label')}
      className="edge-fade-x flex gap-1 overflow-x-auto overscroll-x-contain"
    >
      {days.map((day) => {
        const dayStartMs = cellDayStart(day.date, zone);
        const load = loads.get(dayStartMs);
        const isSelected = selectedDayMs === dayStartMs;
        const isPast = dayStartMs < todayMs;
        return (
          <button
            key={day.key}
            type="button"
            aria-pressed={isSelected}
            aria-label={dayLabel(day.date, load, day.isToday)}
            aria-current={day.isToday ? 'date' : undefined}
            onClick={() => onSelectDay(isSelected ? null : dayStartMs)}
            className={cx(
              'flex min-h-9 w-12 shrink-0 flex-col items-center gap-1 rounded-xs border px-1 py-1.5',
              interactiveClassName,
              focusRingClassName,
              isSelected ? 'border-accent-dim bg-accent/15' : 'border-transparent',
              isPast ? 'calendar-map-past' : ''
            )}
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
                day.isToday ? 'text-accent' : isPast ? 'text-text-dim' : 'text-text'
              }`}
            >
              {day.date.getDate()}
            </span>
            <span aria-hidden="true" className="flex h-0.5 w-6 gap-px overflow-hidden rounded-full">
              {load?.kinds.map((kind) => (
                <span key={kind} className={kindSegmentClassName(kind)} />
              ))}
            </span>
            <span className="h-3.5 text-[0.6875rem] leading-3.5 text-text-dim tabular-nums">
              {load ? load.count : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
