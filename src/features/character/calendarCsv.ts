import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CalendarEventSummary } from '@/esi/endpoints';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import { parseInstant } from '@/engine/esiInstant';
import { localMidnight } from '@/engine/localDay';

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

/**
 * The events the Coming Up rail lists for calendar events: none while that kind
 * is hidden, only the selected local day when one is picked, else all.
 */
export function calendarExportEvents(
  events: readonly CalendarEventSummary[],
  hiddenKinds: readonly CharacterBoardItemKind[],
  selectedDayMs: number | null
): CalendarEventSummary[] {
  if (hiddenKinds.includes('calendarEvent')) return [];
  if (selectedDayMs === null) return [...events];
  return events.filter((event) => {
    const ms = parseInstant(event.event_date);
    return ms !== null && localMidnight(ms) === selectedDayMs;
  });
}
