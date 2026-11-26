import { useState } from 'react';

export const SECTION_PAGE = 10;

export function usePaged<T>(rows: readonly T[]) {
  const [shown, setShown] = useState(SECTION_PAGE);
  return {
    rows: rows.slice(0, shown),
    remaining: Math.max(rows.length - shown, 0),
    atEnd: rows.length > SECTION_PAGE && shown >= rows.length,
    loadOlder: () => setShown((n) => n + SECTION_PAGE),
  };
}
