import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import {
  isProjectedKind,
  type CalendarResponse,
  type CharacterBoardItem,
} from '@/engine/character/board';
import { KIND_LABEL } from './calendarKindLabels';
import { exportFlag } from '@/lib/exportFlag';
import { isoTime } from '@/lib/exportSheets';

const RESPONSE_KEY: Record<CalendarResponse, string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

/**
 * CSV columns for the Coming Up rail: every kind it lists, told apart by Kind. The date is the instant the
 * clock runs out, as an ISO string. Response and Important belong to calendar events and stay blank otherwise.
 */
export function calendarCsvColumns(t: CsvTranslate): CsvColumn<CharacterBoardItem>[] {
  return [
    { header: t('calendar.csvKind'), value: (item) => t(KIND_LABEL[item.kind]) },
    { header: t('calendar.csvDate'), value: (item) => isoTime(item.deadlineMs) },
    { header: t('calendar.csvTitle'), value: (item) => item.subject },
    {
      header: t('calendar.csvDetail'),
      // The wording the rail prints, falling back to the raw detail it has no sentence for.
      value: (item) =>
        item.detail
          ? t(`calendar.detail.${item.kind}.${item.detail}`, { defaultValue: item.detail })
          : undefined,
    },
    {
      header: t('calendar.csvResponse'),
      value: (item) => (item.response === null ? undefined : t(RESPONSE_KEY[item.response])),
    },
    {
      header: t('calendar.csvImportant'),
      value: (item) => (item.kind === 'calendarEvent' ? exportFlag(t, item.important) : null),
    },
    {
      header: t('calendar.csvProjected'),
      value: (item) => exportFlag(t, isProjectedKind(item.kind)),
    },
    // The source's own id: an ESI event id for calendar events, a job or contract id otherwise.
    {
      header: t('calendar.csvId'),
      value: (item) => (/^\d+$/.test(item.sourceId) ? Number(item.sourceId) : item.sourceId),
    },
  ];
}
