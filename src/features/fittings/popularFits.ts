import { useCallback } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { groupPopularFits, type HullLoss, type PopularFit } from '@/engine/fittings/popularFits';
import { getKillmail } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { fetchHullLosses, type ZkillFailureReason } from '@/lib/zkillboard';
import { loadFittingSlots } from '@/sde/loadSde';
import { MINUTE_MS } from '@/lib/age';

const CACHE_TTL_MS = 10 * MINUTE_MS;

export type PopularFitsResult =
  { ok: true; fits: PopularFit[] } | { ok: false; reason: ZkillFailureReason };

const cache = new Map<number, { at: number; result: PopularFitsResult }>();
const pending = new Map<number, Promise<PopularFitsResult>>();

export function resetPopularFitsCache(): void {
  cache.clear();
  pending.clear();
}

async function resolveLosses(
  shipTypeId: number
): Promise<HullLoss[] | { reason: ZkillFailureReason } | null> {
  const fetched = await fetchHullLosses(shipTypeId);
  if (!fetched.ok) return { reason: fetched.reason };
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
    } catch {}
  });
  return fetched.losses.length > 0 && resolved.length === 0 ? null : resolved;
}

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
    if (losses === null) return { ok: false, reason: 'http' };
    if (!Array.isArray(losses)) return { ok: false, reason: losses.reason };
    const result: PopularFitsResult = {
      ok: true,
      fits: groupPopularFits(losses, await loadFittingSlots()),
    };
    cache.set(shipTypeId, { at: now, result });
    return result;
  } catch {
    return { ok: false, reason: 'http' };
  }
}

export function usePopularFits(
  shipTypeId: number,
  load: (shipTypeId: number) => Promise<PopularFitsResult>
): PopularFitsResult | null {
  const loadFor = useCallback(() => load(shipTypeId), [load, shipTypeId]);
  return useAsyncLoad(loadFor).data ?? null;
}
