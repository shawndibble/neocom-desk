import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { cellDayStart, dayStart } from '@/engine/localDay';
import { useTimeZone } from '@/lib/timeFormat';
import { weekdayLabels, type GridDay, type WeekStart } from '@/lib/calendarGrid';
import { cx } from '@/lib/cx';
import { focusRingInsetClassName, interactiveClassName } from '@/components/ui/controlStyles';

import { KIND_TEXT } from '@/components/ui/kindTone';
import { KIND_ICON } from './calendarKindIcons';
import { useDayLoadLabel } from './dayLoadLabel';

export interface CalendarMapProps {
  days: readonly GridDay[];
  loads: Map<number, DayLoad>;
  nowMs: number;
  weekStart: WeekStart;
  selectedDayMs: number | null;
  onSelectDay: (dayStartMs: number | null) => void;
}

export function CalendarMap({
  days,
  loads,
  nowMs,
  weekStart,
  selectedDayMs,
  onSelectDay,
}: CalendarMapProps) {
  const { t } = useTranslation();
  const labels = weekdayLabels(weekStart);
  const dayLabel = useDayLoadLabel();
  const zone = useTimeZone();
  const todayMs = dayStart(nowMs, zone);

  return (
    <>
      <div
        role="group"
        aria-label={t('calendar.map.label')}
        className="grid grid-cols-7 divide-x divide-line border-b border-line"
      >
        {labels.map((label) => (
          <div
            key={label}
            aria-hidden="true"
            className={cx(eyebrowClassName, 'border-b border-line px-2 py-1 text-center')}
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dayStartMs = cellDayStart(day.date, zone);
          const load = loads.get(dayStartMs);
          const isPast = dayStartMs < todayMs && load === undefined;
          const isSelected = selectedDayMs === dayStartMs;
          return (
            <button
              key={day.key}
              type="button"
              aria-pressed={isSelected}
              aria-label={dayLabel(day.date, load, day.isToday)}
              aria-current={day.isToday ? 'date' : undefined}
              onClick={() => onSelectDay(isSelected ? null : dayStartMs)}
              className={cx(
                'flex min-h-20 flex-col border-b border-line p-1.5 text-left',
                interactiveClassName,
                focusRingInsetClassName,
                isSelected ? 'bg-accent/15 ring-1 ring-accent-dim ring-inset' : 'hover:bg-panel-2',
                day.isToday && !isSelected ? 'ring-1 ring-accent ring-inset' : '',
                !day.inCurrentMonth ? 'bg-panel/40' : '',
                isPast ? 'calendar-map-past' : ''
              )}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span
                  className={`text-[0.6875rem] tabular-nums ${
                    day.isToday ? 'font-semibold text-accent' : 'text-text-dim'
                  }`}
                >
                  {day.date.getDate()}
                </span>
                {load && (
                  <span className="text-[0.6875rem] text-text-dim tabular-nums">{load.count}</span>
                )}
              </span>
              {load && (
                <span className="mt-auto flex flex-wrap items-center gap-0.5 pt-1">
                  {load.kinds.map((kind) => {
                    const Glyph = KIND_ICON[kind];
                    return (
                      <Glyph
                        key={kind}
                        aria-hidden="true"
                        className={`size-3.5 shrink-0 md:size-4 ${KIND_TEXT[kind]}`}
                      />
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
