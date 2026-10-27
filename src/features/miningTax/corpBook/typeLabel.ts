/** A raw ore type's name, or its id when the SDE names do not cover it. */
export const typeLabel = (names: ReadonlyMap<number, string>, typeId: number): string =>
  names.get(typeId) ?? `#${typeId}`;
