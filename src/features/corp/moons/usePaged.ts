import { useState } from 'react';

/** Rows a section shows first, and how many each "Load older" adds. */
export const SECTION_PAGE = 10;

/** The first rows of a list, and the "Load older" that grows it. */
export function usePaged<T>(rows: readonly T[]) {
  const [shown, setShown] = useState(SECTION_PAGE);
  return {
    rows: rows.slice(0, shown),
    remaining: Math.max(rows.length - shown, 0),
    /** Everything fits only after the reader asked for more: the end line's cue. */
    atEnd: rows.length > SECTION_PAGE && shown >= rows.length,
    loadOlder: () => setShown((n) => n + SECTION_PAGE),
  };
}
