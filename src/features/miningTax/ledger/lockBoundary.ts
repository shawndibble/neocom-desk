import { createElement, type ReactNode } from 'react';
import { LockDividerLine } from './LockDividerLine';

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
  const oneRun = older.slice(first, last + 1).every(Boolean);
  if (!oneRun || (first !== 0 && last !== rows.length - 1)) return undefined;
  const at = first === 0 && last < rows.length - 1 ? last + 1 : first;
  const row = rows[at];
  return row === undefined ? undefined : keyOf(row);
}

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
