export const ROW_LIMIT = 100;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function namedLike<T extends { name: string }>(entries: readonly T[], needle: string): T[] {
  return entries.filter((entry) => entry.name.toLowerCase().includes(needle)).sort(byName);
}

export const needleOf = (query: string) => query.trim().toLowerCase();
