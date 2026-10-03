/**
 * Everything the Implant Finder needs to say where an implant or booster
 * can be had and what it costs the pilot: sell orders at every Trade Hub,
 * every LP Store offer that hands it out, what each store's LP is valued at,
 * the pilot's LP with each store, and the turn-ins they already own or would
 * have to buy at their hub. Ranking those is `engine/fittings/implantSources.ts`.
 *
 * LP Stores carry no index of what they sell, so every store's offers are
 * read — each cached a day by `loadLoyaltyStoreOffers`, and remembered here
 * for the session, so only the first search pays for the fan-out.
 */
import { detectOwnedStock } from '@/engine/industry/ownedStock';
import type { LpOfferInput, SourceContext } from '@/engine/fittings/implantSources';
import type { HubPrice } from '@/engine/fittings/implantFinder';
import type { LpRate } from '@/engine/loyalty/marketLpValue';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadLpRates } from '@/features/industry/blueprintPurchaseOffers';
import { loadOwnedStockSnapshot } from '@/features/industry/ownedStockDetection';
import { loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { loadLpCorporations } from '@/sde/loadMarketSde';

const storeOffers = new Map<number, Promise<LoyaltyStoreOffer[]>>();

function offersOf(corporationId: number): Promise<LoyaltyStoreOffer[]> {
  let pending = storeOffers.get(corporationId);
  if (!pending) {
    pending = loadLoyaltyStoreOffers(corporationId).then(
      (result) => result?.data ?? [],
      () => {
        storeOffers.delete(corporationId);
        return [];
      }
    );
    storeOffers.set(corporationId, pending);
  }
  return pending;
}

/** Every LP Store offer, from any store, that hands out one of `typeIds`. */
export async function loadLpOffersFor(
  typeIds: readonly number[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<number, LpOfferInput[]>> {
  const wanted = new Set(typeIds);
  const corporations = (await loadLpCorporations()).filter((c) => c.id !== PARAGON_CORPORATION_ID);
  const found = new Map<number, LpOfferInput[]>();
  let done = 0;
  await mapWithConcurrencyLimit(corporations, ESI_FANOUT_CONCURRENCY, async (corporation) => {
    for (const offer of await offersOf(corporation.id)) {
      if (!wanted.has(offer.type_id)) continue;
      const list = found.get(offer.type_id) ?? [];
      list.push({
        corporationId: corporation.id,
        corpName: corporation.name,
        iskCost: offer.isk_cost,
        lpCost: offer.lp_cost,
        quantity: offer.quantity,
        requiredItems: offer.required_items.map((r) => ({
          typeId: r.type_id,
          quantity: r.quantity,
        })),
      });
      found.set(offer.type_id, list);
    }
    done += 1;
    onProgress?.(done, corporations.length);
  });
  return found;
}

/** One LP Store the shown offers come from, for the "Your LP" line. */
export interface LpStoreSummary {
  corporationId: number;
  corpName: string;
  /** Null when the pilot's LP can't be read (no Character, or no loyalty scope). */
  balance: number | null;
  rate: LpRate;
}

export interface ImplantPurchase {
  offersFor: (typeId: number) => readonly LpOfferInput[];
  context: SourceContext;
  stores: LpStoreSummary[];
}

async function lpBalances(characterId: number | null): Promise<Map<number, number> | null> {
  if (characterId === null) return null;
  try {
    const result = await loadCharacterLoyaltyPoints(characterId);
    const entries = result.cached?.data;
    return entries ? new Map(entries.map((e) => [e.corporation_id, e.loyalty_points])) : null;
  } catch {
    return null;
  }
}

async function ownedItems(typeIds: readonly number[]): Promise<Map<number, number>> {
  if (typeIds.length === 0) return new Map();
  try {
    const snapshot = await loadOwnedStockSnapshot();
    const detected = detectOwnedStock(snapshot.sources, new Set(typeIds));
    return new Map([...detected].map(([id, stock]) => [id, stock.quantity]));
  } catch {
    return new Map();
  }
}

async function pricesAtEveryHub(typeIds: readonly number[]): Promise<Map<number, HubPrice[]>> {
  const perHub = await Promise.all(
    TRADE_HUBS.map(async (hub) => ({ hub, prices: await getHubPrices(hub, [...typeIds]) }))
  );
  return new Map(
    typeIds.map((typeId) => [
      typeId,
      perHub.map(({ hub, prices }) => ({
        hubId: hub.id,
        sellMin: prices.get(typeId)?.sellMin ?? null,
        sellVolume: prices.get(typeId)?.sellVolume ?? 0,
      })),
    ])
  );
}

/** Where each of `typeIds` can be had, and what it costs this pilot, buying at `hub`. */
export async function loadImplantPurchase(
  typeIds: readonly number[],
  hub: TradeHub,
  characterId: number | null,
  onProgress?: (done: number, total: number) => void
): Promise<ImplantPurchase> {
  const [lpOffers, hubPrices, balances] = await Promise.all([
    loadLpOffersFor(typeIds, onProgress),
    pricesAtEveryHub(typeIds),
    lpBalances(characterId),
  ]);
  const offers = [...lpOffers.values()].flat();
  const corporations = [...new Set(offers.map((o) => o.corporationId))];
  const turnInIds = [...new Set(offers.flatMap((o) => o.requiredItems.map((r) => r.typeId)))];
  const [rateFor, owned, turnInPrices] = await Promise.all([
    loadLpRates(corporations, hub),
    ownedItems(turnInIds),
    turnInIds.length > 0 ? getHubPrices(hub, turnInIds) : Promise.resolve(new Map()),
  ]);
  const names = new Map(offers.map((o) => [o.corporationId, o.corpName]));
  return {
    offersFor: (typeId) => lpOffers.get(typeId) ?? [],
    context: {
      selectedHubId: hub.id,
      hubPrices: (typeId) => hubPrices.get(typeId) ?? [],
      turnInPrice: (typeId) => turnInPrices.get(typeId)?.sellMin ?? null,
      lpRate: (corporationId) => rateFor(corporationId).rate,
      lpBalance: (corporationId) => (balances ? (balances.get(corporationId) ?? 0) : null),
      owned: (typeId) => owned.get(typeId) ?? 0,
    },
    stores: corporations.map((corporationId) => ({
      corporationId,
      corpName: names.get(corporationId)!,
      balance: balances ? (balances.get(corporationId) ?? 0) : null,
      rate: rateFor(corporationId),
    })),
  };
}
