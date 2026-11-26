import { detectOwnedStock } from '@/engine/industry/ownedStock';
import type { LpOfferInput, SourceContext } from '@/engine/fittings/implantSources';
import type { HubPrice } from '@/engine/fittings/implantFinder';
import type { LpRate } from '@/engine/loyalty/marketLpValue';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadLpRates } from '@/features/loyalty/lpRates';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadOwnedStockSnapshot } from '@/features/industry/ownedStockDetection';
import { loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
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
        offerId: offer.offer_id,
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

export interface LpStoreSummary {
  corporationId: number;
  corpName: string;
  balance: number | null;
  rate: LpRate;
}

export interface ImplantPurchase {
  offersFor: (typeId: number) => readonly LpOfferInput[];
  context: SourceContext;
  stores: LpStoreSummary[];
  itemName: (typeId: number) => string;
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

function ownedItems(
  snapshot: Awaited<ReturnType<typeof loadOwnedStockSnapshot>> | null,
  typeIds: readonly number[]
): Map<number, number> {
  if (!snapshot || typeIds.length === 0) return new Map();
  const detected = detectOwnedStock(snapshot.sources, new Set(typeIds));
  return new Map([...detected].map(([id, stock]) => [id, stock.quantity]));
}

async function pricesAtEveryHub(
  typeIds: readonly number[],
  percent: number
): Promise<Map<number, HubPrice[]>> {
  const perHub = await Promise.all(
    TRADE_HUBS.map(async (hub) => ({ hub, prices: await getHubPricesAt(hub, typeIds, percent) }))
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

export async function loadImplantPurchase(
  typeIds: readonly number[],
  hub: TradeHub,
  characterId: number | null,
  onProgress?: (done: number, total: number) => void,
  percent = 100
): Promise<ImplantPurchase> {
  const [lpOffers, hubPrices, balances, snapshot] = await Promise.all([
    loadLpOffersFor(typeIds, onProgress),
    pricesAtEveryHub(typeIds, percent),
    lpBalances(characterId),
    loadOwnedStockSnapshot().catch(() => null),
  ]);
  const offers = [...lpOffers.values()].flat();
  const corporations = [...new Set(offers.map((o) => o.corporationId))];
  const turnInIds = [...new Set(offers.flatMap((o) => o.requiredItems.map((r) => r.typeId)))];
  const [rateFor, turnInPrices, turnInNames] = await Promise.all([
    loadLpRates(corporations, hub),
    turnInIds.length > 0 ? getHubPricesAt(hub, turnInIds, percent) : Promise.resolve(new Map()),
    turnInIds.length > 0
      ? loadTypeNames(turnInIds).catch(() => new Map<number, string>())
      : Promise.resolve(new Map<number, string>()),
  ]);
  const owned = ownedItems(snapshot, turnInIds);
  const names = new Map(offers.map((o) => [o.corporationId, o.corpName]));
  const balanceOf = (corporationId: number) =>
    balances ? (balances.get(corporationId) ?? 0) : null;
  return {
    offersFor: (typeId) => lpOffers.get(typeId) ?? [],
    context: {
      selectedHubId: hub.id,
      hubPrices: (typeId) => hubPrices.get(typeId) ?? [],
      turnInPrice: (typeId) => turnInPrices.get(typeId)?.sellMin ?? null,
      lpRate: (corporationId) => rateFor(corporationId).rate,
      lpBalance: balanceOf,
      owned: (typeId) => owned.get(typeId) ?? 0,
    },
    stores: corporations.map((corporationId) => ({
      corporationId,
      corpName: names.get(corporationId)!,
      balance: balanceOf(corporationId),
      rate: rateFor(corporationId),
    })),
    itemName: (typeId) => turnInNames.get(typeId) ?? `#${typeId}`,
  };
}
