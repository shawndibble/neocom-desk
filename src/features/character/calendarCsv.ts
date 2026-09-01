import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CalendarEventSummary } from '@/esi/endpoints';

const RESPONSE_KEY: Record<CalendarEventSummary['event_response'], string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

/**
 * CSV columns for calendar events: date, title, response. `date` passes
 * through as the raw ISO string, not the `toLocaleString()` display
 * rendering. `response` reuses the same translated labels the list shows.
 */
export function calendarCsvColumns(t: CsvTranslate): CsvColumn<CalendarEventSummary>[] {
  return [
    { header: t('calendar.csvDate'), value: (event) => event.event_date },
    { header: t('calendar.csvTitle'), value: (event) => event.title },
    { header: t('calendar.csvResponse'), value: (event) => t(RESPONSE_KEY[event.event_response]) },
  ];
}
