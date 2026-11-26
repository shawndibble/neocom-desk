import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { KIND_LABEL } from './calendarKindLabels';

export function useDayLoadLabel(): (
  date: Date,
  load: DayLoad | undefined,
  isToday?: boolean
) => string {
  const { t, i18n } = useTranslation();

  return useMemo(() => {
    const fullDate = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const kindList = new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' });

    const withToday = (text: string, isToday: boolean | undefined) =>
      isToday ? t('calendar.map.todayPrefix', { label: text }) : text;

    return (date, load, isToday) =>
      withToday(
        load
          ? t('calendar.map.dayWithLoad', {
              date: fullDate.format(date),
              count: load.count,
              kinds: kindList.format(load.kinds.map((kind) => t(KIND_LABEL[kind]))),
            })
          : t('calendar.map.dayEmpty', { date: fullDate.format(date) }),
        isToday
      );
  }, [t, i18n.language]);
}
