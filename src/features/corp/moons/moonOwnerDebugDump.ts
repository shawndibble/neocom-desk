/**
 * `?debug=1` on the Moons page: one console line a corp mate can paste back when a moon owner
 * shows Gone quiet. Corp ids, statuses, timestamps and reason codes only: no tokens, no names.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BookFeeder } from '../taxBook/bookClient';
import { useBook } from './useBook';

export const DEBUG_PARAM = 'debug';

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

/** The facts that say why a moon owner is not being read, one object per moon owner. */
export function moonOwnerDebugDump(
  bookCorporationId: number,
  feeders: readonly BookFeeder[],
  now: number
) {
  return {
    bookCorporationId,
    at: iso(now),
    owners: feeders.map((f) => ({
      corporationId: f.corporationId,
      status: f.status,
      sameOwner: f.sameOwner === true,
      joinedAt: iso(f.joinedAt),
      grantHolder: f.grantHolder ?? null,
      lastReadWellAt: f.lastReadWellAt ?? null,
      staleSince: iso(f.staleSince),
      disconnectedAt: iso(f.disconnectedAt),
      lastSyncAt: iso(f.lastSyncResult?.at),
      lastSyncOutcome: f.lastSyncResult?.outcome ?? null,
      lastSyncReason: f.lastSyncResult?.reason ?? null,
    })),
  };
}

/** Logs the dump once per load of the book when the URL carries `?debug=1`. */
export function useMoonOwnerDebugDump(): void {
  const [params] = useSearchParams();
  const { corporationId, data } = useBook();
  const on = params.get(DEBUG_PARAM) === '1';
  const feeders = data.feeders;
  useEffect(() => {
    if (!on || !feeders) return;
    console.log(
      'neocom-debug ' + JSON.stringify(moonOwnerDebugDump(corporationId, feeders, Date.now()))
    );
  }, [on, corporationId, feeders]);
}
