import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db';
import type { NetWorthSnapshotRecord } from '@/db/records';
import { latestNetWorthByCharacter, type LatestNetWorth } from '@/engine/netWorth/latest';

const NONE: ReadonlyMap<number, LatestNetWorth> = new Map();

/** Each Character's newest snapshot row, read off the `[characterId+day]` index, not the table. */
export async function loadNewestSnapshots(): Promise<NetWorthSnapshotRecord[]> {
  const ids = await db.netWorthSnapshots.orderBy('characterId').uniqueKeys();
  const rows = await Promise.all(
    ids.map((id) =>
      db.netWorthSnapshots
        .where('[characterId+day]')
        .between([id, Dexie.minKey], [id, Dexie.maxKey])
        .last()
    )
  );
  return rows.filter((r): r is NetWorthSnapshotRecord => r !== undefined);
}

/**
 * Each Character's newest Net Worth Snapshot as one total, for the Characters
 * table's Net Worth column. Reads the stored snapshots only: nothing is
 * fetched, so a Character the app has not snapshotted yet has no entry.
 */
export function useLatestNetWorth(): ReadonlyMap<number, LatestNetWorth> {
  const rows = useLiveQuery(() => loadNewestSnapshots(), []);
  return useMemo(() => (rows ? latestNetWorthByCharacter(rows) : NONE), [rows]);
}
