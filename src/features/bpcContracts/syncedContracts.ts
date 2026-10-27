/**
 * Reads the Public Contract Offers snapshot (issues #906, #907, ADR 0013) from
 * Cloudflare R2 (ADR 0019), published by the `syncPublicContractOffers`
 * scheduled function and narrowed here to the blueprint copies (and originals)
 * BPC Search searches. Until #907 that narrowing was a second, blueprint-only
 * ingestion pipeline; the snapshot now carries every for-sale item type and
 * each consumer takes the slice it wants.
 *
 * It is not per-character data, so it goes through `esi/cache.ts`'s
 * `GLOBAL_CACHE_CHARACTER_ID` sentinel, same trade every other
 * character-independent public lookup makes (`stations.ts`,
 * `regionNames.ts`). R2 objects are public, so no Firebase session is needed.
 */
import {
  loadWithCache,
  readCached,
  GLOBAL_CACHE_CHARACTER_ID,
  type CachedResult,
} from '@/esi/cache';
import { loadR2BlueprintRows, loadR2OfferIndex } from '@/features/contractSearch/r2OfferSnapshot';
import { loadBlueprints } from '@/sde/loadSde';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import {
  bpcRowsFromContractOffers,
  bpoRowsFromContractOffers,
} from '@/engine/contracts/contractOffers';

/** The Dexie cache key; unchanged since the Firestore read so existing caches carry over. */
const CACHE_KEY = 'publicContractOffers';

/**
 * How often the backend republishes the snapshot, and therefore the soonest a
 * refetch can return anything new. `STALE_AFTER.default`'s ten minutes is the
 * app-wide promise for a *Character's* own mutable data; against an hourly
 * publish it just re-reads a byte-identical snapshot up to six times per
 * cycle. The UI shows the snapshot's `lastSyncedAt` rather than when this
 * browser last read it.
 */
const SNAPSHOT_PUBLISH_INTERVAL_MS = 60 * 60_000;

export interface PublicBpcContractsSnapshot {
  rows: BpcContractRow[];
  /**
   * Blueprint originals on public contract (issue #1240), `runs: -1`. Kept out
   * of `rows` so BPC Sourcing's copy-only search is unchanged. Optional: a
   * snapshot cached before this field existed has none, which reads as "no
   * listed originals" until the next refetch.
   */
  originals?: BpcContractRow[];
  /** When the backend last pulled EVE Ref's archive — the freshness that actually matters here, distinct from when this browser last read it. Null when nothing has synced yet. */
  lastSyncedAt: number | null;
}

/**
 * Only the blueprint types are read, found by crossing the R2 index's listed
 * types with the SDE's blueprints, instead of every type (ADR 0019, issue
 * #3746) — from the index's blueprints bundle shards when it names them, a few
 * reads instead of one per blueprint type. `null` when R2 or the SDE cannot answer: R2 is the only store (issue
 * #4270), so that is the panel's "unavailable" state, never a Firestore read.
 *
 * One consequence: a contract's other lines are not read, so a bundle mixing
 * one blueprint with ordinary items tallies as a single-type contract and is
 * not flagged `isMultiType` (issue #1076). A bundle of two or more blueprint
 * types still is.
 */
async function fetchSnapshot(): Promise<PublicBpcContractsSnapshot | null> {
  const index = await loadR2OfferIndex();
  if (!index) return null;
  const { lastSyncedAt } = index.data;
  // Stale but unchanged: nothing to read.
  const cached = await readCached<PublicBpcContractsSnapshot>(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY);
  if (cached?.lastSyncedAt === lastSyncedAt) return cached;
  try {
    const blueprints = await loadBlueprints();
    const typeIds = Object.keys(blueprints)
      .map(Number)
      .filter((typeId) => String(typeId) in index.data.types);
    const offers = await loadR2BlueprintRows(index.data, typeIds);
    if (!offers) return null;
    return {
      rows: bpcRowsFromContractOffers(offers),
      originals: bpoRowsFromContractOffers(offers),
      lastSyncedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Cache-through the same way every ESI-backed view loads (`fromCache` for
 * the offline banner, a manual refresh re-fetches) even though the live side
 * is R2, not ESI — `loadWithCache` only needs a `fetchLive`. A lapsed copy is
 * served while the next publish is read behind it, so a visit after the
 * hourly window opens on the last snapshot instead of waiting on the read.
 */
export function loadPublicBpcContracts(): Promise<CachedResult<PublicBpcContractsSnapshot> | null> {
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, CACHE_KEY, fetchSnapshot, {
    staleAfterMs: SNAPSHOT_PUBLISH_INTERVAL_MS,
    allowStaleServe: true,
  });
}
