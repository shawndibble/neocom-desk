export function typeLabels(typeIds: Iterable<number>, names: ReadonlyMap<number, string>): string {
  return [...typeIds].map((typeId) => names.get(typeId) ?? `#${typeId}`).join(', ');
}
