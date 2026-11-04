import type { TFunction } from 'i18next';
import type { ActiveFilter } from '@/components/ui';
import { formatIsoDay } from '@/lib/formatDateTick';

/** A filter with Wallet's inclusive `YYYY-MM-DD` From/To pair (`DateRangeFields`). */
interface DateRangeFilter {
  startDate: string | null;
  endDate: string | null;
}

/**
 * The From and To ends of a Wallet date range as `FilterBar` pills, one each,
 * captioned as `DateRangeFields` captions them. Two pills rather than one
 * "range" pill because each end is its own field and clears on its own. A
 * range of one day (a click on the ISK-flow chart's bar) is one "Day" pill
 * that clears both, since the two ends are one pick there. Shared by the
 * Journal and Transactions bars, which use the same pair.
 */
export function activeDateRangeFilters<T extends DateRangeFilter>(
  filter: T,
  t: TFunction
): ActiveFilter<T>[] {
  const active: ActiveFilter<T>[] = [];
  if (filter.startDate !== null && filter.startDate === filter.endDate)
    return [
      {
        label: t('wallet.dateDayLabel'),
        value: formatIsoDay(filter.startDate),
        clear: (value) => ({ ...value, startDate: null, endDate: null }),
      },
    ];
  if (filter.startDate !== null)
    active.push({
      label: t('wallet.dateFromLabel'),
      value: formatIsoDay(filter.startDate),
      clear: (value) => ({ ...value, startDate: null }),
    });
  if (filter.endDate !== null)
    active.push({
      label: t('wallet.dateToLabel'),
      value: formatIsoDay(filter.endDate),
      clear: (value) => ({ ...value, endDate: null }),
    });
  return active;
}
