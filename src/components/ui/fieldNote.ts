import { createContext, useContext } from 'react';

/** The id of the enclosing `Field`'s note, when it has one, so its control can be described by it. */
export const FieldNoteContext = createContext<string | undefined>(undefined);

/**
 * Joins `aria-describedby` id lists, dropping blanks and repeats; `undefined`
 * when nothing is left, so the attribute is absent rather than empty.
 */
export function mergeDescribedBy(...lists: (string | undefined)[]): string | undefined {
  const ids = new Set(lists.flatMap((list) => list?.split(/\s+/) ?? []).filter(Boolean));
  return ids.size > 0 ? [...ids].join(' ') : undefined;
}

/** `describedBy` plus the enclosing `Field`'s note, caller's ids first. */
export function useDescribedBy(describedBy?: string): string | undefined {
  return mergeDescribedBy(describedBy, useContext(FieldNoteContext));
}
