import { formatIsoDay } from '@/lib/formatDateTick';
import { parseNumeric } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

export interface ActiveFilter<T> {
  label: string;
  value?: string;
  clear: (value: T) => T;
  field?: string;
  inline?: boolean;
}

export function activeFilterText(filter: { label: string; value?: string }): string {
  return filter.value ? `${filter.label}: ${filter.value}` : filter.label;
}

export function summarizeFilterValues(names: readonly string[], t: Translate): string {
  if (names.length === 0) return t('filters.none');
  if (names.length <= 2) return names.join(', ');
  return t('filters.valuesAndMore', {
    values: names.slice(0, 2).join(', '),
    count: names.length - 2,
  });
}

export function boundText(
  raw: string,
  format: (value: number) => string,
  parse: (raw: string) => number | null = parseNumeric
): string {
  const parsed = parse(raw);
  return parsed === null ? raw.trim() : format(parsed);
}

interface DateRangeFilter {
  startDate: string | null;
  endDate: string | null;
}

export function activeDateRangeFilters<T extends DateRangeFilter>(
  filter: T,
  t: Translate,
  labels: { from: string; to: string }
): ActiveFilter<T>[] {
  if (filter.startDate !== null && filter.startDate === filter.endDate)
    return [
      {
        label: t('filters.day'),
        value: formatIsoDay(filter.startDate),
        clear: (value) => ({ ...value, startDate: null, endDate: null }),
        field: labels.from,
      },
    ];
  const active: ActiveFilter<T>[] = [];
  if (filter.startDate !== null)
    active.push({
      label: labels.from,
      value: formatIsoDay(filter.startDate),
      clear: (value) => ({ ...value, startDate: null }),
    });
  if (filter.endDate !== null)
    active.push({
      label: labels.to,
      value: formatIsoDay(filter.endDate),
      clear: (value) => ({ ...value, endDate: null }),
    });
  return active;
}

export function clearFilters<T>(value: T, active: readonly ActiveFilter<T>[]): T {
  return active.reduce((next, filter) => filter.clear(next), value);
}
