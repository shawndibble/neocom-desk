import { useState } from 'react';

/** Rows a section shows first, and how many each "Load older" adds. */
export const SECTION_PAGE = 10;

/** The newest rows of a list, and the "Load older" that grows it. */
export function usePaged<T>(rows: readonly T[], first = SECTION_PAGE, step = SECTION_PAGE) {
  const [shown, setShown] = useState(first);
  return {
    rows: rows.slice(0, shown),
    remaining: Math.max(rows.length - shown, 0),
    /** Everything fits only after the reader asked for more: the end line's cue. */
    atEnd: rows.length > first && shown >= rows.length,
    loadOlder: () => setShown((n) => n + step),
  };
}
