import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { CalendarResponse, CharacterBoardItem } from '@/engine/character/board';
import { KIND_LABEL } from './calendarKindLabels';

const RESPONSE_KEY: Record<CalendarResponse, string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

/**
 * CSV columns for the Coming Up rail: every kind the screen lists (calendar
 * events, skill training, jobs, PI, dens, moon chunks, skyhooks, contract and
 * order expiries, the skill plan), told apart by Kind. The date is the instant
 * the clock runs out, as an ISO string, not the rail's countdown. Response and
 * Important belong to calendar events alone and stay blank for the rest.
 */
export function calendarCsvColumns(t: CsvTranslate): CsvColumn<CharacterBoardItem>[] {
  return [
    { header: t('calendar.csvKind'), value: (item) => t(KIND_LABEL[item.kind]) },
    { header: t('calendar.csvDate'), value: (item) => new Date(item.deadlineMs).toISOString() },
    { header: t('calendar.csvTitle'), value: (item) => item.subject },
    { header: t('calendar.csvDetail'), value: (item) => item.detail || undefined },
    {
      header: t('calendar.csvResponse'),
      value: (item) => (item.response === null ? undefined : t(RESPONSE_KEY[item.response])),
    },
    {
      header: t('calendar.csvImportant'),
      value: (item) =>
        item.kind === 'calendarEvent'
          ? t(item.important ? 'calendar.csvYes' : 'calendar.csvNo')
          : undefined,
    },
    // The source's own id: an ESI event id for calendar events, a job or contract id otherwise.
    { header: t('calendar.csvId'), value: (item) => item.sourceId },
  ];
}
