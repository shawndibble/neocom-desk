/**
 * Reads the LP Store offers snapshot (issue #2873): every LP corporation's
 * offers and station systems, published daily by the `public-data-lp-store` GitHub Actions job as one
 * object in Cloudflare R2 (docs/context/decisions/20261018-201511-moving-the-daily-snapshots-to-r2.md). Public and unauthenticated, so the page works with no
 * Firebase session.
 *
 * ESI's offers carry no home station, so a corporation is as far as its
 * nearest station: the snapshot lists every system it has one in.
 *
 * Cache-through like the contract snapshots (global key, a window matched to
 * the backend's cadence, a lapsed copy served while the next read runs), with
 * `null` for "unavailable" so the page shows its unavailable state.
 */
import { loadWithCache, GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import type { R2Snapshot, R2SnapshotRead } from '@/features/contractSearch/r2Snapshot';
import { R2_SNAPSHOT_ORIGIN, fetchJson } from '@/features/contractSearch/r2OfferSnapshot';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { HOUR_MS } from '@/lib/age';

/** `[offerId, typeId, quantity, iskCost, lpCost, requiredItems: [typeId, quantity][]]` */
export type LpSnapshotOffer = [number, number, number, number, number, [number, number][]];

/** One corporation's row of the LP offers snapshot. */
export interface LpSnapshotStore {
  corporationId: number;
  systemIds: number[];
  offers: LpSnapshotOffer[];
}

export interface NearestStation {
  systemId: number;
  jumps: number;
}

/** The station system with the fewest jumps; null when none is reachable or distances are not known yet. */
export function nearestStation(
  systemIds: readonly number[],
  jumps: ReadonlyMap<number, number> | null
): NearestStation | null {
  if (jumps === null) return null;
  let best: NearestStation | null = null;
  for (const systemId of systemIds) {
    const count = jumps.get(systemId);
    if (count !== undefined && (best === null || count < best.jumps)) {
      best = { systemId, jumps: count };
    }
  }
  return best;
}

export function toStoreOffer(offer: LpSnapshotOffer): LoyaltyStoreOffer {
  const [offer_id, type_id, quantity, isk_cost, lp_cost, required] = offer;
  return {
    offer_id,
    type_id,
    quantity,
    isk_cost,
    lp_cost,
    required_items: required.map(([requiredType, requiredQuantity]) => ({
      type_id: requiredType,
      quantity: requiredQuantity,
    })),
  };
}

const SNAPSHOT_URL = `${R2_SNAPSHOT_ORIGIN}/lp-store-offers/snapshot.json`;
const CACHE_KEY = 'lpStoreOffersR2';
/** The backend republishes once a day. */
const STALE_AFTER_MS = 12 * HOUR_MS;

/** The fields the search reads unguarded; a row without them would throw in a render. */
function isStoreRow(value: unknown): value is LpSnapshotStore {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.corporationId === 'number' &&
    Array.isArray(row.systemIds) &&
    Array.isArray(row.offers)
  );
}

/** The object as `functions/src/r2DailySnapshots.ts` writes it, or `null` when it is not that shape. */
export function parseLpStoreSnapshot(raw: unknown): R2Snapshot<LpSnapshotStore> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { lastSyncedAt, rows } = raw as Record<string, unknown>;
  if (typeof lastSyncedAt !== 'number' || !(lastSyncedAt > 0)) return null;
  if (!Array.isArray(rows) || !rows.every(isStoreRow)) return null;
  return { rows, lastSyncedAt };
}

async function fetchSnapshot(): Promise<R2Snapshot<LpSnapshotStore> | null> {
  try {
    return parseLpStoreSnapshot(await fetchJson(SNAPSHOT_URL));
  } catch {
    return null;
  }
}

export async function loadLpStoreSnapshot(): Promise<R2SnapshotRead<LpSnapshotStore>> {
  const cached = await loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchSnapshot, {
    staleAfterMs: STALE_AFTER_MS,
    allowStaleServe: true,
  });
  const lapsed = cached !== null && cached.fetchedAt.getTime() + STALE_AFTER_MS <= Date.now();
  return { cached, revalidating: lapsed && !cached.fromCache };
}
