/** 7-column week grid — more room per event than a Month cell, less scanning than the flat Agenda list. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { buildWeekDays, groupByDayKey, weekdayLabels } from '@/lib/calendarGrid';
import { RESPONSE_BORDER_TONE } from './calendarResponseTone';
import { EventContextMenu } from './EventContextMenu';
import type { CalendarEventSummary } from '@/esi/endpoints';

export interface CalendarWeekViewProps {
  weekAnchor: Date;
  events: CalendarEventSummary[];
  onSelectEvent: (event: CalendarEventSummary) => void;
  /** Row context menu's "Add to Month View" (issue #416): jumps Month view to an event's date. */
  onAddToMonthView: (date: Date) => void;
}

export function CalendarWeekView({
  weekAnchor,
  events,
  onSelectEvent,
  onAddToMonthView,
}: CalendarWeekViewProps) {
  const { t } = useTranslation();
  const days = useMemo(() => buildWeekDays(weekAnchor), [weekAnchor]);
  const labels = useMemo(() => weekdayLabels(), []);
  const grouped = useMemo(
    () => groupByDayKey(events, (event) => new Date(event.event_date)),
    [events]
  );
  // See CalendarMonthView's identical comment: distinct from "no events ever".
  const hasEventsInView = useMemo(
    () => days.some((day) => (grouped.get(day.key)?.length ?? 0) > 0),
    [days, grouped]
  );

  return (
    <Panel padded={false} className="overflow-hidden">
      {!hasEventsInView && (
        <p className="border-b border-line px-3 py-2 text-xs text-text-dim">
          {t('calendar.noEventsThisWeek')}
        </p>
      )}
      <div
        role="region"
        aria-label={t('calendar.weekGridLabel')}
        className="grid grid-cols-7 divide-x divide-line"
      >
        {days.map((day, i) => (
          <div
            key={day.key}
            className={`border-b border-line px-2 py-1.5 text-center ${day.isToday ? 'bg-panel-2/60' : ''}`}
          >
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {labels[i]}
            </p>
            <p className={`text-xs font-semibold ${day.isToday ? 'text-accent' : 'text-text'}`}>
              {day.date.getDate()}
            </p>
          </div>
        ))}
        {days.map((day) => (
          <div
            key={day.key}
            className={`min-h-64 space-y-1 p-1 ${day.isToday ? 'bg-panel-2/30' : ''}`}
          >
            {(grouped.get(day.key) ?? []).map((event) => (
              <EventContextMenu
                key={event.event_id}
                eventId={event.event_id}
                eventDate={new Date(event.event_date)}
                onAddToMonthView={onAddToMonthView}
              >
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className={`block w-full truncate rounded-xs border-l-2 bg-panel-2/60 px-1.5 py-0.5 text-left text-[0.6875rem] transition-colors hover:bg-panel-2 ${RESPONSE_BORDER_TONE[event.event_response]}`}
                >
                  {new Date(event.event_date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  {event.title}
                </button>
              </EventContextMenu>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
