/**
 * Loads one corporation's market **LP Value** at a Trade Hub — its store
 * priced exactly as the LP Store page prices it (`computeLoyaltyOfferRows`,
 * selling at the hub's sell price), then read by `marketLpValue`. Priced for
 * no particular pilot: untrained trade skills and no standing, so the fees
 * are the full ones and the rate errs low rather than flattering the LP.
 *
 * Remembered per corporation and hub for a while; the offers and prices
 * underneath are cached on their own terms.
 */
import { marketLpValue } from '@/engine/loyalty/marketLpValue';
import { loadBlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { loadMarketSnapshot } from '@/features/industry/marketData';
import type { TradeHub } from '@/market/hubs';
import { computeLoyaltyOfferRows, offerPriceTypeIds } from './offerRows';
import { loadLoyaltyStoreOffers } from './store';

const REMEMBER_MS = 15 * 60 * 1000;

const remembered = new Map<string, { at: number; value: Promise<number | null> }>();

async function compute(corporationId: number, hub: TradeHub): Promise<number | null> {
  const [offersResult, catalog] = await Promise.all([
    loadLoyaltyStoreOffers(corporationId),
    loadBlueprintCatalog(),
  ]);
  const offers = offersResult?.data ?? [];
  if (offers.length === 0) return null;
  const snapshot = await loadMarketSnapshot(hub, offerPriceTypeIds(offers, catalog));
  const rows = computeLoyaltyOfferRows({
    offers,
    catalog,
    hubPrices: snapshot.hubPrices,
    adjustedPrices: snapshot.adjustedPrices,
    systemCostIndex: snapshot.systemCostIndex,
    skills: {},
    materialSourcing: undefined,
    liquidationBasis: 'order',
    playerLp: 0,
  });
  return marketLpValue(
    rows.map((row) => {
      const sold = row.productTypeId ?? row.offer.type_id;
      return {
        iskPerLp: row.profit.iskPerLp,
        sellVolume: snapshot.hubSellVolumes[sold] ?? 0,
        // A blueprint offer's depth is counted in products, one run each.
        quantity: row.productTypeId === null ? row.offer.quantity : 1,
      };
    })
  );
}

/** ISK per LP the market pays for `corporationId`'s LP at `hub`; null when its store gives too little to go on. */
export function loadMarketLpValue(
  corporationId: number,
  hub: TradeHub,
  now: () => number = Date.now
): Promise<number | null> {
  const key = `${corporationId}|${hub.id}`;
  const hit = remembered.get(key);
  if (hit && now() - hit.at < REMEMBER_MS) return hit.value;
  const value = compute(corporationId, hub).catch(() => null);
  remembered.set(key, { at: now(), value });
  return value;
}

/** Market LP Values for several corporations at once, keyed by corporation id. */
export async function loadMarketLpValues(
  corporationIds: Iterable<number>,
  hub: TradeHub
): Promise<Map<number, number | null>> {
  const ids = [...new Set(corporationIds)];
  const values = await Promise.all(ids.map((id) => loadMarketLpValue(id, hub)));
  return new Map(ids.map((id, i) => [id, values[i]!]));
}
