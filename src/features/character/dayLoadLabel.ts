/**
 * The accessible name for one day of the Calendar Map or the Day Ticker.
 *
 * Shared because the two surfaces answer the same question at two widths, and
 * a day that reads "3 due: Industry jobs and Planets" in the grid must read
 * the same on a phone. Both already built an identical `Intl.DateTimeFormat`
 * for it; the kind list would have been the second copy of the second thing.
 *
 * This is what carries DESIGN.md §7 for the map and the ticker: their dots and
 * segments are pure colour, so the day's own name has to say which kinds it is
 * drawing. It names the kinds rather than a severity because the colour on
 * this page no longer encodes urgency — see `components/ui/kindTone.ts`.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { DayLoad } from '@/engine/character/deadlines';
import { KIND_LABEL } from './calendarKindLabels';

export function useDayLoadLabel(): (date: Date, load: DayLoad | undefined) => string {
  const { t, i18n } = useTranslation();

  // Both formatters are built once per language rather than per cell: a month
  // grid asks this 42 times on every render.
  return useMemo(() => {
    const fullDate = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const kindList = new Intl.ListFormat(i18n.language, { style: 'short', type: 'conjunction' });

    return (date, load) =>
      load
        ? t('calendar.map.dayWithLoad', {
            date: fullDate.format(date),
            count: load.count,
            kinds: kindList.format(load.kinds.map((kind) => t(KIND_LABEL[kind]))),
          })
        : t('calendar.map.dayEmpty', { date: fullDate.format(date) });
  }, [t, i18n.language]);
}
