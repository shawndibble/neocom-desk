/**
 * How many of a filter bar's controls are narrowing the list: the count for
 * `FilterBar`'s `activeCount` badge. Pass one entry per control, each truthy
 * when that control is set (a non-empty string, a flag, a `!== default` test).
 */
export function countActive(controls: readonly unknown[]): number {
  return controls.filter(Boolean).length;
}
