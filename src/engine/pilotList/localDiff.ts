/** Share of a pasted Local list that must also be in the previous paste before "new" means anything. */
export const MIN_LOCAL_OVERLAP = 0.5;

const key = (name: string) => name.trim().toLowerCase();

/**
 * Names in `current` that were not in the `previous` paste. `null` when there is
 * nothing to compare (first paste) or the two lists share too little to be the
 * same system's Local, so a jump somewhere else marks nobody.
 */
export function newArrivals(
  current: readonly string[],
  previous: readonly string[] | null,
  minOverlap = MIN_LOCAL_OVERLAP
): Set<string> | null {
  if (!previous || previous.length === 0 || current.length === 0) return null;
  const before = new Set(previous.map(key));
  const added = current.filter((name) => !before.has(key(name)));
  const overlap = (current.length - added.length) / current.length;
  return overlap >= minOverlap ? new Set(added) : null;
}
