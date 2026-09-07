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
 * day can hold a calendar *event*. The old grid let a pilot page back into a
 * month of empty cells and draw the obvious wrong conclusion; saying so once
 * under the grid is cheaper than an empty state they have to trigger.
 *
 * A past day is not necessarily empty, though, and the caption must not say it
 * is: the five other clocks on this board can be *overdue*, and an industry
 * job sitting `ready` since Tuesday buckets onto Tuesday. Hatching therefore
 * means "nothing new can land here", not "nothing is here" — which is why
 * these cells still draw their count and their dots.
 */
import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { localMidnight } from '@/engine/character/deadlines';
import { weekdayLabels, type GridDay } from '@/lib/calendarGrid';
import { cx } from '@/lib/cx';

import { SEVERITY_FILL, SEVERITY_LABEL } from '@/components/ui/severityTone';

/** Beyond this a cell shows a count instead of more dots — four dots is already a texture, not a number. */
const MAX_DOTS = 4;

export interface CalendarMapProps {
  days: readonly GridDay[];
  loads: Map<number, DayLoad>;
  nowMs: number;
  selectedDayMs: number | null;
  onSelectDay: (dayStartMs: number | null) => void;
}

/**
 * Why the hatched cells are hatched.
 *
 * Exported because the phone shows a Day Ticker rather than this grid and owes
 * the reader the same sentence — two copies of the wording is one copy too
 * many for a caption whose whole job is to be exact.
 */
export function CalendarPastHint({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return <p className={cx('text-xs text-text-dim', className)}>{t('calendar.map.pastHint')}</p>;
}

export function CalendarMap({ days, loads, nowMs, selectedDayMs, onSelectDay }: CalendarMapProps) {
  const { t, i18n } = useTranslation();
  const labels = weekdayLabels();
  const fullDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const todayMs = localMidnight(nowMs);

  return (
    <>
      {/*
        A plain grid of buttons, not `role="grid"`. The ARIA grid pattern wants
        `role="row"` wrappers this layout does not have, and `role="gridcell"`
        on a button displaces the implicit button role — taking `aria-pressed`
        with it, which is the only thing announcing which day is selected.
        Each cell's own `aria-label` carries the whole answer instead.
      */}
      <div
        role="group"
        aria-label={t('calendar.map.label')}
        className="grid grid-cols-7 divide-x divide-line border-b border-line"
      >
        {labels.map((label) => (
          <div
            key={label}
            aria-hidden="true"
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
              aria-pressed={isSelected}
              /*
                DESIGN.md §7: colour is never the only signal. The dots carry
                severity visually and nothing else does, so the day's own name
                says it in words — which is also what makes the weekday header
                row safe to hide from assistive tech.
              */
              aria-label={
                load
                  ? t('calendar.map.dayWithLoad', {
                      date: fullDate.format(day.date),
                      count: load.count,
                      severity: t(SEVERITY_LABEL[load.severity]),
                    })
                  : t('calendar.map.dayEmpty', { date: fullDate.format(day.date) })
              }
              // A past day is still a real button: pressing it scopes the rail
              // to a day that is genuinely empty, which is a truthful answer.
              // Disabling it would leave the pilot with a dead control and no
              // explanation, which is what the caption under the grid replaces.
              onClick={() => onSelectDay(isSelected ? null : dayStartMs)}
              className={cx(
                'flex min-h-20 flex-col border-b border-line p-1.5 text-left transition-colors',
                isSelected ? 'bg-accent/15 ring-1 ring-accent-dim ring-inset' : 'hover:bg-panel-2',
                day.isToday && !isSelected ? 'ring-1 ring-accent ring-inset' : '',
                !day.inCurrentMonth ? 'bg-panel/40' : '',
                isPast ? 'calendar-map-past' : ''
              )}
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
                      className={`size-1.5 rounded-full ${SEVERITY_FILL[load.severity]}`}
                    />
                  ))}
                  {load.count > MAX_DOTS && (
                    <span className="text-[0.6875rem] text-text-dim tabular-nums">
                      +{load.count - MAX_DOTS}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <CalendarPastHint className="px-3 py-2" />
    </>
  );
}
