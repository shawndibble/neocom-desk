import { idSetKey } from '@/lib/idSetKey';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useCallback, useMemo } from 'react';
import { db } from '@/db';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import {
  lpRedemptionOffer,
  marketSellOffer,
  turnInCost,
  type LpBlueprintRedemption,
} from '@/engine/industry/blueprintPurchaseOffers';
import { detectOwnedStock } from '@/engine/industry/ownedStock';
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { findLpOfferMatches, type LpOfferMatch } from '@/features/market/appraisalLpAcquisition';
import { loadGlobalMarketOverrides } from '@/features/market/orderBookView';
import { loadBlueprintLpRate } from '@/features/loyalty/lpRates';
import { useLpValue } from '@/features/loyalty/lpValue';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { lpPickPrice } from './blueprintAcquisitionSources';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadInventionMarket, type InventionMarket } from './inventionSources';
import { EMPTY_OWNED_STOCK_SNAPSHOT, loadOwnedStockSnapshot } from './ownedStockDetection';
import { usePricePercentFor } from '@/features/market/pagePricePercents';

export type BlueprintOffersLookup = (blueprintTypeID: number) => readonly BpcOffer[];

const NO_OFFERS: readonly BpcOffer[] = [];
export const NO_BLUEPRINT_PURCHASE_OFFERS: BlueprintOffersLookup = () => NO_OFFERS;

export function blueprintTypeIdsIn(
  typeIds: readonly number[],
  catalog: Pick<BlueprintCatalog, 'byBlueprintTypeID'>
): number[] {
  return typeIds.filter((typeId) => catalog.byBlueprintTypeID.has(typeId));
}

function redemptionOf(offer: LoyaltyStoreOffer): LpBlueprintRedemption {
  return {
    quantity: offer.quantity,
    requiredItems: offer.required_items.map((item) => ({
      typeId: item.type_id,
      quantity: item.quantity,
    })),
  };
}

export type LpTurnInPricer = (offer: LoyaltyStoreOffer) => number | null;

export async function loadLpTurnInPricer(
  hub: TradeHub,
  offers: readonly LoyaltyStoreOffer[]
): Promise<LpTurnInPricer> {
  const turnInIds = [
    ...new Set(offers.flatMap((offer) => offer.required_items.map((item) => item.type_id))),
  ];
  if (turnInIds.length === 0) return () => 0;
  const [prices, owned] = await Promise.all([
    getHubPrices(hub, turnInIds).catch(() => new Map()),
    loadOwnedStockSnapshot().catch(() => EMPTY_OWNED_STOCK_SNAPSHOT),
  ]);
  const ownedStock = detectOwnedStock(owned.sources, new Set(turnInIds));
  return (offer) =>
    turnInCost(
      redemptionOf(offer).requiredItems,
      (typeId) => prices.get(typeId)?.sellMin ?? undefined,
      (typeId) => ownedStock.get(typeId)?.quantity ?? 0
    );
}

async function accountCharacterIds(characterId: number | null): Promise<number[]> {
  const others = await db.characters
    .toArray()
    .then((characters) => characters.map((c) => c.characterId))
    .catch(() => [] as number[]);
  return [...new Set([...(characterId === null ? [] : [characterId]), ...others])];
}

async function accountLpMatches(
  characterIds: readonly number[],
  ids: readonly number[]
): Promise<Map<number, LpOfferMatch[]>> {
  const results = await Promise.all(
    characterIds.map((id) => findLpOfferMatches(id, ids).catch(() => null))
  );
  const byType = new Map<number, LpOfferMatch[]>();
  const seen = new Set<string>();
  for (const result of results) {
    for (const [typeId, matches] of result?.matchesByTypeId ?? []) {
      for (const match of matches) {
        const key = `${match.corporationId}:${match.offer.offer_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        byType.set(typeId, [...(byType.get(typeId) ?? []), match]);
      }
    }
  }
  return byType;
}

async function marketSellPrices(
  hub: TradeHub,
  ids: readonly number[]
): Promise<Map<number, number | null>> {
  const overrides = await loadGlobalMarketOverrides();
  const byRegion = new Map<number, number[]>();
  for (const id of ids) {
    const regionId = overrides.get(id)?.regionId ?? hub.regionId;
    byRegion.set(regionId, [...(byRegion.get(regionId) ?? []), id]);
  }
  const perRegion = await Promise.all(
    [...byRegion].map(([regionId, regionIds]) => getRegionSellPrices(regionId, regionIds))
  );
  const prices = new Map<number, number | null>();
  for (const result of perRegion) for (const [id, price] of result) prices.set(id, price);
  return prices;
}

export async function loadBlueprintPurchaseOffers(
  characterId: number | null,
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): Promise<BlueprintOffersLookup> {
  const ids = [...new Set(blueprintTypeIds)];
  if (ids.length === 0) return NO_BLUEPRINT_PURCHASE_OFFERS;

  const [market, lpByType] = await Promise.all([
    marketSellPrices(hub, ids).catch(() => new Map<number, number | null>()),
    accountCharacterIds(characterId).then((characterIds) => accountLpMatches(characterIds, ids)),
  ]);
  const matches = [...lpByType.values()].flat();
  const [turnIns, lpRate] = await Promise.all([
    loadLpTurnInPricer(
      hub,
      matches.map((match) => match.offer)
    ),
    loadBlueprintLpRate(),
  ]);

  const byType = new Map<number, BpcOffer[]>();
  for (const typeId of ids) {
    const offers: BpcOffer[] = [];
    const sell = marketSellOffer(market.get(typeId) ?? null);
    if (sell) offers.push(sell);
    for (const { offer } of lpByType.get(typeId) ?? []) {
      const turnInsCost = turnIns(offer);
      if (turnInsCost === null) continue;
      const redemption = lpRedemptionOffer(
        { quantity: offer.quantity, requiredItems: [] },
        Math.round(lpPickPrice(offer.isk_cost, offer.lp_cost, lpRate.rate) + turnInsCost),
        () => undefined,
        () => 0
      );
      if (redemption) offers.push(redemption);
    }
    if (offers.length > 0) byType.set(typeId, offers);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? NO_OFFERS;
}

export async function lpBlueprintPickPrice(
  offer: LoyaltyStoreOffer,
  hub: TradeHub
): Promise<number | null> {
  const [{ rate }, turnIns] = await Promise.all([
    loadBlueprintLpRate(),
    loadLpTurnInPricer(hub, [offer]),
  ]);
  const turnInsCost = turnIns(offer);
  if (turnInsCost === null) return null;
  return Math.round(lpPickPrice(offer.isk_cost, offer.lp_cost, rate) + turnInsCost);
}

export interface BlueprintPurchaseOffersState {
  offersFor: BlueprintOffersLookup;
  inventionMarket: InventionMarket | null;
  ready: boolean;
}

export function useBlueprintPurchaseOffers(
  characterId: number | null,
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): BlueprintPurchaseOffersState {
  const rate = useLpValue((state) => state.value);
  const pricePercent = usePricePercentFor('industry');
  const idsKey = idSetKey(blueprintTypeIds);
  const key = `${characterId ?? ''}|${hub.id}|${rate}|${pricePercent}|${idsKey}`;
  const ids = useMemo(() => (idsKey === '' ? [] : idsKey.split(',').map(Number)), [idsKey]);
  const loader = useCallback(async () => {
    const [lookup, inventionMarket] = await Promise.all([
      loadBlueprintPurchaseOffers(characterId, hub, ids).catch(() => NO_BLUEPRINT_PURCHASE_OFFERS),
      loadInventionMarket(hub, ids, pricePercent),
    ]);
    return { lookup, inventionMarket };
  }, [characterId, hub, ids, pricePercent]);
  const { data: loaded } = useKeyedLoad(key, loader);
  return useMemo(
    () => ({
      offersFor: loaded?.lookup ?? NO_BLUEPRINT_PURCHASE_OFFERS,
      inventionMarket: loaded?.inventionMarket ?? null,
      ready: loaded !== undefined,
    }),
    [loaded]
  );
}
