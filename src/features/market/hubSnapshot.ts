/**
 * Reads the Mining Yield Overview's server-side price snapshot (issue #1279,
 * `functions/src/marketSnapshot.ts`): one Firestore doc per UTC date, written
 * by the `captureMiningPriceSnapshot` scheduled function. Not per-character
 * data — public market history — so it goes through the shared cache
 * (`GLOBAL_CACHE_CHARACTER_ID`), the same trade every other
 * character-independent public lookup makes (`syncedContracts.ts`,
 * `stations.ts`). Reading requires being signed in to Firebase as *some*
 * character (the collection's rule is `request.auth != null`), reusing
 * `ensureSignedIn` exactly as `syncedContracts.ts` already does.
 *
 * A day's `source` tag decides which price-basis tier it feeds
 * (`priceBasis.ts`): 'fuzzwork' is real Jita station data, fed as `saved`
 * alongside the per-browser Dexie snapshot (`priceSnapshots.ts`); 'adam4eve'
 * is a real buy/sell split but region-wide, fed as the weaker `historical`
 * tier. Only `DEFAULT_TRADE_HUB` (Jita) is read — the Overview's pricing
 * never reads the other 4 hubs the server also captures.
 */
import {
  collection,
  documentId,
  endAt,
  getDocs,
  orderBy,
  query,
  startAt,
} from 'firebase/firestore/lite';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { ensureSignedIn } from '@/sync/syncAuth';
import { isSyncConfigured } from '@/app/syncStatus';
import { GLOBAL_CACHE_CHARACTER_ID, STALE_AFTER, loadWithCache } from '@/esi/cache';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { SidePrices } from '@/engine/miningTax/priceBasis';

const COLLECTION = 'marketHistory';

interface StoredHubPrice {
  buy: number | null;
  sell: number | null;
}

interface MarketHistoryDocData {
  hubs?: Record<string, Record<string, StoredHubPrice>>;
  source?: 'fuzzwork' | 'adam4eve';
}

export interface HubSnapshotRange {
  /** Jita prices for a day the server itself captured live (source: fuzzwork), by date then type id. */
  saved: Map<string, Map<number, SidePrices>>;
  /** Adam4EVE's region-wide historical split (source: adam4eve), by date then type id. */
  historical: Map<string, Map<number, SidePrices>>;
}

const EMPTY_RANGE: HubSnapshotRange = { saved: new Map(), historical: new Map() };

/**
 * Fetches every server-captured day in `[startDate, endDate]` (inclusive),
 * split by source. Returns empty maps when sync isn't configured, sign-in
 * fails, or the read fails: this only ever feeds an optional price tier
 * (`priceBasis.ts` already falls further back to ESI's average), so a
 * failure here just leaves those days priced as they were before this
 * existed, the same tolerance `loadPriceHistory` applies to a 400 from ESI's
 * own history endpoint.
 */
export async function loadHubSnapshotRange(
  characterId: number,
  startDate: string,
  endDate: string
): Promise<HubSnapshotRange> {
  if (!isSyncConfigured() || startDate > endDate) return EMPTY_RANGE;

  try {
    await ensureSignedIn(characterId);
  } catch {
    return EMPTY_RANGE;
  }

  const cacheKey = `marketHistory:${startDate}:${endDate}`;
  const cached = await loadWithCache<Record<string, MarketHistoryDocData>>(
    GLOBAL_CACHE_CHARACTER_ID,
    cacheKey,
    async () => {
      const snapshot = await getDocs(
        query(
          collection(getSyncFirestore(), COLLECTION),
          orderBy(documentId()),
          startAt(startDate),
          endAt(endDate)
        )
      );
      const byDate: Record<string, MarketHistoryDocData> = {};
      for (const doc of snapshot.docs) byDate[doc.id] = doc.data() as MarketHistoryDocData;
      return byDate;
    },
    { staleAfterMs: STALE_AFTER.default }
  ).catch(() => null);

  if (!cached) return EMPTY_RANGE;

  const stationKey = String(DEFAULT_TRADE_HUB.stationId);
  const result: HubSnapshotRange = { saved: new Map(), historical: new Map() };
  for (const [date, doc] of Object.entries(cached.data)) {
    const stationPrices = doc.hubs?.[stationKey];
    if (!stationPrices || !doc.source) continue;
    const byType = new Map<number, SidePrices>();
    for (const [typeIdStr, prices] of Object.entries(stationPrices)) {
      byType.set(Number(typeIdStr), { buy: prices.buy, sell: prices.sell });
    }
    result[doc.source === 'fuzzwork' ? 'saved' : 'historical'].set(date, byType);
  }
  return result;
}
