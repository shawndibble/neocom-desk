/** Dense single-line-per-event list — the default view's predecessor, kept as an option. */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { RESPONSE_KEY, RESPONSE_TEXT_TONE } from './calendarResponseTone';
import type { CalendarEventSummary } from '@/esi/endpoints';

export interface CalendarAgendaViewProps {
  events: CalendarEventSummary[];
  onSelectEvent: (event: CalendarEventSummary) => void;
}

export function CalendarAgendaView({ events, onSelectEvent }: CalendarAgendaViewProps) {
  const { t } = useTranslation();

  return (
    <Panel padded={false}>
      <ul aria-label={t('calendar.agendaListLabel')} className="divide-y divide-line">
        {events.map((event) => (
          <li key={event.event_id}>
            <button
              type="button"
              onClick={() => onSelectEvent(event)}
              className="grid w-full grid-cols-[9rem_1fr_auto] items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-panel-2"
            >
              <span className="truncate text-text-faint">
                {new Date(event.event_date).toLocaleString()}
              </span>
              <span className="truncate font-semibold">{event.title}</span>
              <span className={`shrink-0 ${RESPONSE_TEXT_TONE[event.event_response]}`}>
                {t(RESPONSE_KEY[event.event_response])}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
