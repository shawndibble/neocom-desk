/** Shared sort comparators. Pure. */

export const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name);

export const byNumericId = (a: number, b: number): number => a - b;
