export const typeLabel = (names: ReadonlyMap<number, string>, typeId: number): string =>
  names.get(typeId) ?? `#${typeId}`;
