/** A long list of blueprints shows this many rows; the search narrows it. */
export const ROW_LIMIT = 100;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The entries whose name contains the search text (all of them when it is empty), by name. */
export function namedLike<T extends { name: string }>(entries: readonly T[], needle: string): T[] {
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle)).sort(byName);
}

/** Lower-cased, trimmed search text, as `namedLike` expects it. */
export const needleOf = (query: string) => query.trim().toLowerCase();
