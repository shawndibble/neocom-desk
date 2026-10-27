/** Comma-joined display names for ore type ids, falling back to `#id` for a name not loaded yet. */
export function typeLabels(typeIds: Iterable<number>, names: ReadonlyMap<number, string>): string {
  return [...typeIds].map((typeId) => names.get(typeId) ?? `#${typeId}`).join(', ');
}
