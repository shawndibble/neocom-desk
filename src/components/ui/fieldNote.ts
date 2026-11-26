import { createContext, useContext } from 'react';

export const FieldNoteContext = createContext<string | undefined>(undefined);

export function mergeDescribedBy(...lists: (string | undefined)[]): string | undefined {
  const ids = new Set(lists.flatMap((list) => list?.split(/\s+/) ?? []).filter(Boolean));
  return ids.size > 0 ? [...ids].join(' ') : undefined;
}

export function useDescribedBy(describedBy?: string): string | undefined {
  return mergeDescribedBy(describedBy, useContext(FieldNoteContext));
}
