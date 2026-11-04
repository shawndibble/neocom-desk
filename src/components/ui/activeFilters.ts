/**
 * The route side of `FilterBar`'s active-filter pills: the shape a route
 * describes each filter in, and the pure helpers around it. Its own module so
 * `FilterBar.tsx` exports components only (Fast Refresh).
 */

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
}

export function activeFilterText(filter: { label: string; value?: string }): string {
  return filter.value ? `${filter.label}: ${filter.value}` : filter.label;
}

/**
 * An `ActiveFilter.value` for a filter that picks several things (regions,
 * categories, statuses): up to two names as they are, more as the first two
 * and a count of the rest — "The Forge, Domain +3" — so one pill stays short.
 */
export function summarizeFilterValues(
  names: readonly string[],
  t: (key: 'filters.valuesAndMore', options: { values: string; count: number }) => string
): string {
  if (names.length <= 2) return names.join(', ');
  return t('filters.valuesAndMore', {
    values: names.slice(0, 2).join(', '),
    count: names.length - 2,
  });
}

/** Every active filter cleared at once: each `clear` folded over the value. */
export function clearFilters<T>(value: T, active: readonly ActiveFilter<T>[]): T {
  return active.reduce((next, filter) => filter.clear(next), value);
}
