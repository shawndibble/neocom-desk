/**
 * The Calendar Map: the month (or fortnight) as a map, not as a container.
 *
 * The grid used to hold up to three event chips per cell and defer the rest to
 * a Week view. It no longer holds anything — a cell shows its date, how many
 * clocks land on it, and a dot per clock coloured by severity. The detail
 * lives in the Coming Up Rail beside it, which has the width for it.
 *
 * **Past days are drawn, hatched and captioned.** ESI's `/calendar` returns
 * events from now only and the cache replaces its row wholesale, so no past
 * day can ever hold anything on any device. The old grid let a pilot page back
 * into a month of empty cells and draw the obvious wrong conclusion; saying so
 * once under the grid is cheaper than an empty state they have to trigger to
 * learn the rule.
 */
import { useTranslation } from 'react-i18next';
import type { DeadlineSeverity } from '@/engine/severity';
import type { DayLoad } from '@/engine/character/deadlines';
import { localMidnight } from '@/engine/character/deadlines';
import { weekdayLabels, type GridDay } from '@/lib/calendarGrid';

/** The same four tones the rows and the ticker use — one severity vocabulary across the page. */
const SEVERITY_DOT: Record<DeadlineSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  watch: 'bg-accent',
  clear: 'bg-text-dim',
};

/** Beyond this a cell shows a count instead of more dots — four dots is already a texture, not a number. */
const MAX_DOTS = 4;

export interface CalendarMapProps {
  days: readonly GridDay[];
  loads: Map<number, DayLoad>;
  nowMs: number;
  selectedDayMs: number | null;
  onSelectDay: (dayStartMs: number | null) => void;
}

export function CalendarMap({ days, loads, nowMs, selectedDayMs, onSelectDay }: CalendarMapProps) {
  const { t } = useTranslation();
  const labels = weekdayLabels();
  const todayMs = localMidnight(nowMs);

  return (
    <>
      <div
        role="grid"
        aria-label={t('calendar.map.label')}
        className="grid grid-cols-7 divide-x divide-line border-b border-line"
      >
        {labels.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="border-b border-line px-2 py-1 text-center text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dayStartMs = localMidnight(day.date.getTime());
          const load = loads.get(dayStartMs);
          const isPast = dayStartMs < todayMs;
          const isSelected = selectedDayMs === dayStartMs;
          return (
            <button
              key={day.key}
              type="button"
              role="gridcell"
              aria-pressed={isSelected}
              // A past day is still a real button: pressing it scopes the rail
              // to a day that is genuinely empty, which is a truthful answer.
              // Disabling it would leave the pilot with a dead control and no
              // explanation, which is what the caption under the grid replaces.
              onClick={() => onSelectDay(isSelected ? null : dayStartMs)}
              className={[
                'flex min-h-20 flex-col border-b border-line p-1.5 text-left transition-colors',
                isSelected ? 'bg-accent/15 ring-1 ring-accent-dim ring-inset' : 'hover:bg-panel-2',
                day.isToday && !isSelected ? 'ring-1 ring-accent ring-inset' : '',
                !day.inCurrentMonth ? 'bg-panel/40' : '',
                isPast ? 'calendar-map-past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="flex items-baseline justify-between">
                <span
                  className={`text-[0.6875rem] tabular-nums ${
                    day.isToday
                      ? 'font-semibold text-accent'
                      : isPast || !day.inCurrentMonth
                        ? 'text-text-faint'
                        : 'text-text-dim'
                  }`}
                >
                  {day.date.getDate()}
                </span>
                {load && (
                  <span className="text-[0.6875rem] text-text-dim tabular-nums">{load.count}</span>
                )}
              </span>
              {load && (
                <span className="mt-auto flex flex-wrap items-center gap-1 pt-1">
                  {Array.from({ length: Math.min(load.count, MAX_DOTS) }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${SEVERITY_DOT[load.severity]}`}
                    />
                  ))}
                  {load.count > MAX_DOTS && (
                    <span className="text-[0.625rem] text-text-dim tabular-nums">
                      +{load.count - MAX_DOTS}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="px-3 py-2 text-xs text-text-dim">{t('calendar.map.pastHint')}</p>
    </>
  );
}
