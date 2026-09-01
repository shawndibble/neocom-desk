/** Month grid — the default Calendar view. Days with more than a few events defer to Week for room. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { buildMonthGrid, groupByDayKey, weekdayLabels } from '@/lib/calendarGrid';
import { RESPONSE_BORDER_TONE } from './calendarResponseTone';
import type { CalendarEventSummary } from '@/esi/endpoints';

const MAX_CHIPS_PER_DAY = 3;

export interface CalendarMonthViewProps {
  monthAnchor: Date;
  events: CalendarEventSummary[];
  onSelectEvent: (event: CalendarEventSummary) => void;
  /** A day cell overflowed its chip cap — parent switches to Week, anchored on this date. */
  onExpandDay: (date: Date) => void;
}

export function CalendarMonthView({
  monthAnchor,
  events,
  onSelectEvent,
  onExpandDay,
}: CalendarMonthViewProps) {
  const { t } = useTranslation();
  const days = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const labels = useMemo(() => weekdayLabels(), []);
  const grouped = useMemo(
    () => groupByDayKey(events, (event) => new Date(event.event_date)),
    [events]
  );

  return (
    <Panel padded={false} className="overflow-hidden">
      <div
        role="region"
        aria-label={t('calendar.monthGridLabel')}
        className="grid grid-cols-7 divide-x divide-line"
      >
        {labels.map((label) => (
          <div
            key={label}
            className="border-b border-line px-2 py-1 text-center text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dayEvents = grouped.get(day.key) ?? [];
          const visible = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayEvents.length - visible.length;
          return (
            <div
              key={day.key}
              className={`min-h-24 space-y-0.5 border-b border-line p-1 ${
                day.isToday ? 'bg-panel-2/40' : ''
              } ${!day.inCurrentMonth ? 'bg-panel/40' : ''}`}
            >
              <p
                className={`text-[0.6875rem] ${
                  day.isToday
                    ? 'font-semibold text-accent'
                    : day.inCurrentMonth
                      ? 'text-text-dim'
                      : 'text-text-faint'
                }`}
              >
                {day.date.getDate()}
              </p>
              {visible.map((event) => (
                <button
                  key={event.event_id}
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className={`block w-full truncate rounded-xs border-l-2 bg-panel-2/60 px-1 py-0.5 text-left text-[0.625rem] transition-colors hover:bg-panel-2 ${RESPONSE_BORDER_TONE[event.event_response]}`}
                >
                  {event.title}
                </button>
              ))}
              {overflow > 0 && (
                <button
                  type="button"
                  onClick={() => onExpandDay(day.date)}
                  className="block w-full truncate px-1 text-left text-[0.625rem] text-text-dim hover:text-text"
                >
                  {t('calendar.moreEvents', { count: overflow })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
