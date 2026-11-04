/**
 * The route side of `FilterBar`'s active-filter pills: the shape a route
 * describes each filter in, and the pure helpers around it. Its own module so
 * `FilterBar.tsx` exports components only (Fast Refresh).
 */

import { formatIsoDay } from '@/lib/formatDateTick';
import { parseNumeric } from '@/lib/isk';
import type { Translate } from '@/lib/translate';

/**
 * One filter set away from its default, as `FilterBar` shows it while its
 * controls are closed: a pill reading "label: value" with its own remove.
 */
export interface ActiveFilter<T> {
  /**
   * The filter's caption, already translated — the same string its
   * `FilterField` `label` carries, which is how a click on the pill finds the
   * control to focus.
   */
  label: string;
  /**
   * What it is set to, already translated and short ("Highsec, Lowsec",
   * "≥ 50M"). Omit for a filter whose label says it all — a "Hide risky
   * routes" chip reads as just that.
   */
  value?: string;
  /** The filter value with just this one filter back at its default. */
  clear: (value: T) => T;
  /**
   * The `FilterField` label a click on the pill focuses, when it is not
   * `label` — a one-day range's "Day" pill, which opens on the From field.
   */
  field?: string;
}

export function activeFilterText(filter: { label: string; value?: string }): string {
  return filter.value ? `${filter.label}: ${filter.value}` : filter.label;
}

/**
 * An `ActiveFilter.value` for a filter that picks several things (regions,
 * categories, statuses): up to two names as they are, more as the first two
 * and a count of the rest — "The Forge, Domain +3" — so one pill stays short.
 * An empty pick (every option unticked) reads "None".
 */
export function summarizeFilterValues(names: readonly string[], t: Translate): string {
  if (names.length === 0) return t('filters.none');
  if (names.length <= 2) return names.join(', ');
  return t('filters.valuesAndMore', {
    values: names.slice(0, 2).join(', '),
    count: names.length - 2,
  });
}

/**
 * A typed numeric bound (max price, min reward, max volume) as its pill shows
 * it: the number formatted, or the text as typed while it does not parse yet —
 * a half-typed "1e" still holds something, and its pill should say so rather
 * than vanish mid-keystroke. An ISK field passes `parseIskAmount`, which reads
 * the "50m" and "1,234,567" an `IskInput` holds; a plain count keeps the
 * default.
 */
export function boundText(
  raw: string,
  format: (value: number) => string,
  parse: (raw: string) => number | null = parseNumeric
): string {
  const parsed = parse(raw);
  return parsed === null ? raw.trim() : format(parsed);
}

/** A filter with an inclusive `YYYY-MM-DD` From/To pair (`DateRangeFields`). */
interface DateRangeFilter {
  startDate: string | null;
  endDate: string | null;
}

/**
 * The From and To ends of a date range as pills, one each, captioned as its
 * `DateRangeFields` captions them: each end is its own field and clears on its
 * own. A range of one day (a click on a chart's bar) is one "Day" pill that
 * clears both and opens on the From field, since the two ends are one pick
 * there.
 */
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

/** Every active filter cleared at once: each `clear` folded over the value. */
export function clearFilters<T>(value: T, active: readonly ActiveFilter<T>[]): T {
  return active.reduce((next, filter) => filter.clear(next), value);
}
