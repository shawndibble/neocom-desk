/** A new set with `member` flipped: removed if present, added if not. */
export function toggleInSet<T>(set: ReadonlySet<T>, member: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(member)) next.add(member);
  return next;
}
