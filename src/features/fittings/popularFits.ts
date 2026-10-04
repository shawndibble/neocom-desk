/**
 * Popular fits bound to zKillboard, ESI and the slot map (issue #2327): a
 * hull's recent losses, each victim read inline or — for zKillboard's
 * hash-only shape — from ESI's killmail endpoint, grouped by
 * `engine/fittings/popularFits.ts`. A good result is held in memory per hull
 * for ten minutes, so clicking back to a hull doesn't refetch 40 killmails,
 * and a load already under way is shared — the EVE Workbench tab's "Seen on
 * zKillboard" badges (#2486) ask for the same hull's losses as the zKillboard
 * tab, and must never fetch them a second time.
 */
import { useEffect, useState } from 'react';
import { groupPopularFits, type HullLoss, type PopularFit } from '@/engine/fittings/popularFits';
import { getKillmail } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { fetchHullLosses } from '@/lib/zkillboard';
import { loadFittingSlots } from '@/sde/loadSde';

const CACHE_TTL_MS = 10 * 60_000;

/** `ok: false` when zKillboard or ESI couldn't supply the losses. */
export type PopularFitsResult = { ok: true; fits: PopularFit[] } | { ok: false };

const cache = new Map<number, { at: number; result: PopularFitsResult }>();
const pending = new Map<number, Promise<PopularFitsResult>>();

/** For tests: forget every cached hull. */
export function resetPopularFitsCache(): void {
  cache.clear();
  pending.clear();
}

async function resolveLosses(shipTypeId: number): Promise<HullLoss[] | null> {
  const fetched = await fetchHullLosses(shipTypeId);
  if (!fetched.ok) return null;
  const resolved: HullLoss[] = [];
  await mapWithConcurrencyLimit(fetched.losses, ESI_FANOUT_CONCURRENCY, async (loss) => {
    if (loss.victim !== null) {
      resolved.push({ ...loss, victim: loss.victim });
      return;
    }
    try {
      const killmail = (await getKillmail(loss.killmailId, loss.hash)).data;
      if (!killmail) return;
      resolved.push({
        killmailId: loss.killmailId,
        time: killmail.killmail_time ?? null,
        value: loss.value,
        victim: killmail.victim,
      });
    } catch {
      // One killmail ESI couldn't read leaves the rest of the group intact.
    }
  });
  // Every loss failing on ESI is a failed load, not "nobody flies this".
  return fetched.losses.length > 0 && resolved.length === 0 ? null : resolved;
}

/** The hull's Popular fits. Never throws. */
export async function loadPopularFits(
  shipTypeId: number,
  now: number = Date.now()
): Promise<PopularFitsResult> {
  const hit = cache.get(shipTypeId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  const inFlight = pending.get(shipTypeId);
  if (inFlight) return inFlight;
  const load: Promise<PopularFitsResult> = fetchPopularFits(shipTypeId, now).finally(() => {
    if (pending.get(shipTypeId) === load) pending.delete(shipTypeId);
  });
  pending.set(shipTypeId, load);
  return load;
}

async function fetchPopularFits(shipTypeId: number, now: number): Promise<PopularFitsResult> {
  try {
    const losses = await resolveLosses(shipTypeId);
    if (losses === null) return { ok: false };
    const result: PopularFitsResult = {
      ok: true,
      fits: groupPopularFits(losses, await loadFittingSlots()),
    };
    cache.set(shipTypeId, { at: now, result });
    return result;
  } catch {
    return { ok: false };
  }
}

/**
 * The hull's Popular fits; `null` while loading. A switch of hull drops the old
 * hull's answer. `load` is for tests: pass it stable.
 */
export function usePopularFits(
  shipTypeId: number,
  load: (shipTypeId: number) => Promise<PopularFitsResult> = loadPopularFits
): PopularFitsResult | null {
  const [state, setState] = useState<{ typeId: number; result: PopularFitsResult } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void load(shipTypeId).then((result) => {
      if (!cancelled) setState({ typeId: shipTypeId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [shipTypeId, load]);
  return state?.typeId === shipTypeId ? state.result : null;
}
