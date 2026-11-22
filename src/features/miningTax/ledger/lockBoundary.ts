import { createElement, type ReactNode } from 'react';
import { LockDividerLine } from './LockDividerLine';

/**
 * Where a list sorted by date crosses the Corp Tax Book's lock date: the key of the first row of
 * the older side, so a divider goes just before it. Only a list that runs cleanly one way across
 * the date has a boundary (newest first or oldest first); a list sorted by anything else mixes
 * the two sides and gets none, as does one with nothing older. Every row older: the divider
 * sits at the top.
 */
export function lockBoundaryKey<T>(
  rows: readonly T[],
  lockDate: string,
  dateOf: (row: T) => string,
  keyOf: (row: T) => string | number
): string | number | undefined {
  const older = rows.map((r) => dateOf(r).slice(0, 10) < lockDate);
  const first = older.indexOf(true);
  if (first < 0) return undefined;
  const last = older.lastIndexOf(true);
  // One unbroken run of older rows, reaching an end of the list.
  const oneRun = older.slice(first, last + 1).every(Boolean);
  if (!oneRun || (first !== 0 && last !== rows.length - 1)) return undefined;
  // Oldest first, the older run opens the list and the divider closes it; otherwise it opens it.
  const at = first === 0 && last < rows.length - 1 ? last + 1 : first;
  const row = rows[at];
  return row === undefined ? undefined : keyOf(row);
}

/** `DataTable`'s `rowBoundary` for the lock date, or undefined when the list has no boundary. */
export function lockRowBoundary<T>(
  rows: readonly T[],
  lock: { date: string; label: string } | undefined,
  dateOf: (row: T) => string,
  keyOf: (row: T) => string | number
): { beforeKey: string | number; children: ReactNode } | undefined {
  if (!lock) return undefined;
  const beforeKey = lockBoundaryKey(rows, lock.date, dateOf, keyOf);
  return beforeKey === undefined
    ? undefined
    : { beforeKey, children: createElement(LockDividerLine, { date: lock.label }) };
}
