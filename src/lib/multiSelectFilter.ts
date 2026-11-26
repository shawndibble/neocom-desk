export type MultiSelectFilter<T> = ReadonlySet<T> | 'all';

export function toggleFilterMember<T>(
  previous: MultiSelectFilter<T>,
  member: T,
  universe: readonly T[]
): MultiSelectFilter<T> {
  const next = previous === 'all' ? new Set(universe) : new Set(previous);
  if (next.has(member)) next.delete(member);
  else next.add(member);
  return next.size === universe.length || next.size === 0 ? 'all' : next;
}
