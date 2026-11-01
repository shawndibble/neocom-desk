import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { latestNetWorthByCharacter, type LatestNetWorth } from '@/engine/netWorth/latest';

const NONE: ReadonlyMap<number, LatestNetWorth> = new Map();

/**
 * Each Character's newest Net Worth Snapshot as one total, for the Characters
 * table's Net Worth column. Reads the stored snapshots only: nothing is
 * fetched, so a Character the app has not snapshotted yet has no entry.
 */
export function useLatestNetWorth(): ReadonlyMap<number, LatestNetWorth> {
  const rows = useLiveQuery(() => db.netWorthSnapshots.toArray(), []);
  return useMemo(() => (rows ? latestNetWorthByCharacter(rows) : NONE), [rows]);
}
