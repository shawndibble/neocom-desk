import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { type CalendarResponse, type CharacterBoardItem } from '@/engine/character/board';
import { KIND_LABEL } from './calendarKindLabels';
import { exportFlag } from '@/lib/exportFlag';
import { isoTime } from '@/lib/exportSheets';

const RESPONSE_KEY: Record<CalendarResponse, string> = {
  accepted: 'calendar.responseAccepted',
  declined: 'calendar.responseDeclined',
  tentative: 'calendar.responseTentative',
  not_responded: 'calendar.responseNotResponded',
};

export function calendarCsvColumns(t: CsvTranslate): CsvColumn<CharacterBoardItem>[] {
  return [
    { header: t('calendar.csvKind'), value: (item) => t(KIND_LABEL[item.kind]) },
    { header: t('calendar.csvDate'), value: (item) => isoTime(item.deadlineMs) },
    { header: t('calendar.csvTitle'), value: (item) => item.subject },
    {
      header: t('calendar.csvDetail'),
      value: (item) =>
        item.detail
          ? t(`calendar.detail.${item.kind}.${item.detail}`, { defaultValue: item.detail })
          : undefined,
    },
    { header: t('calendar.csvCorporation'), value: (item) => item.corporation?.name },
    {
      header: t('calendar.csvResponse'),
      value: (item) => (item.response === null ? undefined : t(RESPONSE_KEY[item.response])),
    },
    {
      header: t('calendar.csvImportant'),
      value: (item) => (item.kind === 'calendarEvent' ? exportFlag(t, item.important) : null),
    },
    {
      header: t('calendar.csvId'),
      value: (item) => (/^\d+$/.test(item.sourceId) ? Number(item.sourceId) : item.sourceId),
    },
  ];
}
