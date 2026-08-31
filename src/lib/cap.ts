/** A slice of a list plus whether the true total was larger than what's here. */
export interface Capped<T> {
  items: T[];
  truncated: boolean;
}

/** Cap `items` at `max` entries, reporting whether anything was cut. */
export function capItems<T>(items: readonly T[], max: number): Capped<T> {
  return { items: items.slice(0, max), truncated: items.length > max };
}
