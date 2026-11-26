import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import type { BookFeeder } from '../taxBook/bookClient';
import { isGoneQuiet } from './addCorps/addCorpsStatus';
import { useBook } from './useBook';

const DEBUG_PARAM = 'debug';

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

export function moonOwnerDebugDump(
  bookCorporationId: number,
  feeders: readonly BookFeeder[],
  rows: readonly MoonOwnerRow[],
  now: number
) {
  return {
    bookCorporationId,
    at: iso(now),
    owners: feeders.map((f) => {
      const row = rows.find((r) => r.corporationId === f.corporationId);
      return {
        corporationId: f.corporationId,
        status: f.status,
        shownAs: row?.status ?? null,
        goneQuiet: row !== undefined && isGoneQuiet(row),
        sameOwner: f.sameOwner === true,
        joinedAt: iso(f.joinedAt),
        grantHolder: f.grantHolder ?? null,
        lastReadWellAt: f.lastReadWellAt ?? null,
        staleSince: iso(f.staleSince),
        staleReason: f.staleReason ?? null,
        disconnectedAt: iso(f.disconnectedAt),
        lastSyncAt: iso(f.lastSyncResult?.at),
        lastSyncOutcome: f.lastSyncResult?.outcome ?? null,
        lastSyncReason: f.lastSyncResult?.reason ?? null,
      };
    }),
  };
}

export function useMoonOwnerDebugDump(rows: readonly MoonOwnerRow[]): void {
  const [params] = useSearchParams();
  const { corporationId, data } = useBook();
  const on = params.get(DEBUG_PARAM) === '1';
  const feeders = data.feeders;
  useEffect(() => {
    if (!on || !feeders) return;
    console.log(
      'neocom-debug ' + JSON.stringify(moonOwnerDebugDump(corporationId, feeders, rows, Date.now()))
    );
  }, [on, corporationId, feeders, rows]);
}
