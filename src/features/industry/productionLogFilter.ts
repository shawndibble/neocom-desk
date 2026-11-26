import type { TFunction } from 'i18next';
import { activeDateRangeFilters, type ActiveFilter } from '@/components/ui';
import type { ProductionRunRecord } from '@/db';
import { formatLocalDate } from '@/lib/localDate';

export interface ProductionLogFilter {
  startDate: string | null;
  endDate: string | null;
}

export const EMPTY_PRODUCTION_LOG_FILTER: ProductionLogFilter = {
  startDate: null,
  endDate: null,
};

export function filterProductionRunsByDate(
  runs: readonly ProductionRunRecord[],
  filter: ProductionLogFilter,
  timeZone?: string
): ProductionRunRecord[] {
  return runs.filter((run) => {
    const day = formatLocalDate(new Date(run.loggedAt), timeZone);
    if (filter.startDate !== null && day < filter.startDate) return false;
    if (filter.endDate !== null && day > filter.endDate) return false;
    return true;
  });
}

export function activeProductionLogFilters(
  filter: ProductionLogFilter,
  t: TFunction
): ActiveFilter<ProductionLogFilter>[] {
  return activeDateRangeFilters(filter, t, {
    from: t('industry.dateFromLabel'),
    to: t('industry.dateToLabel'),
  });
}
