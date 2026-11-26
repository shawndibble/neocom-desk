import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db';
import type { NetWorthSnapshotRecord } from '@/db/records';
import { latestNetWorthByCharacter, type LatestNetWorth } from '@/engine/netWorth/latest';

const NONE: ReadonlyMap<number, LatestNetWorth> = new Map();

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

export function useLatestNetWorth(): ReadonlyMap<number, LatestNetWorth> {
  const rows = useLiveQuery(() => loadNewestSnapshots(), []);
  return useMemo(() => (rows ? latestNetWorthByCharacter(rows) : NONE), [rows]);
}
