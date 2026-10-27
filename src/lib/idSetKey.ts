/** Order- and duplicate-insensitive memo/query key for a set of numeric ids. */
export function idSetKey(ids: Iterable<number>): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',');
}
