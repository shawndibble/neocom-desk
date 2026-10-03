/**
 * The Blueprint Acquisition sources automatic tier selection reads beyond
 * public contracts: the cheapest sell order anywhere in the blueprint's
 * market region (the Trade Hub's, or its Global Market Region), and every LP
 * Store redemption any of the account's Characters could make — so a plan
 * never opens with an empty blueprint price while the market or an LP Store
 * sells the blueprint.
 *
 * An LP redemption is priced ISK + LP × its LP Value (`lpRate`: the pilot's
 * own when set, else the store's market value; a redemption nothing prices
 * the LP of is left out rather than counted free) + whatever turn-in items
 * the pilot does not already hold in their assets, at hub sell price (`loadLpTurnInPricer`) — the same number the Blueprint
 * Acquisition modal's LP rows and an LP Store "Plan in Industry" use. One
 * Fuzzwork call per region covers every blueprint in the plan, and the LP
 * lookup reads only corps a Character holds LP with — both cached — so this
 * costs no per-blueprint request.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { useLpValue } from '@/features/loyalty/lpValue';
import { loadMarketLpValues } from '@/features/loyalty/marketLpValue';
import { lpRate, type LpRate } from '@/engine/loyalty/marketLpValue';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { lpPickPrice } from './blueprintAcquisitionSources';
import type { BlueprintCatalog } from './blueprintCatalog';
import { EMPTY_OWNED_STOCK_SNAPSHOT, loadOwnedStockSnapshot } from './ownedStockDetection';

/** Every purchase offer for one blueprint type the loader found. */
export type BlueprintOffersLookup = (blueprintTypeID: number) => readonly BpcOffer[];

const NO_OFFERS: readonly BpcOffer[] = [];
export const NO_BLUEPRINT_PURCHASE_OFFERS: BlueprintOffersLookup = () => NO_OFFERS;

/** The blueprint typeIDs among a plan's `typeIds` (`buildPlanTypeIds` mixes them with materials). */
export function blueprintTypeIdsIn(
  typeIds: readonly number[],
  catalog: Pick<BlueprintCatalog, 'byBlueprintTypeID'>
): number[] {
  return typeIds.filter((typeId) => catalog.byBlueprintTypeID.has(typeId));
}

async function ownLpValue(): Promise<number> {
  try {
    await useLpValue.getState().hydrate();
  } catch {
    // An unreadable setting is the default rate, as everywhere else.
  }
  return useLpValue.getState().value;
}

/**
 * ISK per LP each of `corporationIds`' LP is priced at, at `hub`: the
 * pilot's own LP Value when set, else that store's market value (`lpRate`,
 * which also says whose). A null rate for a store nothing prices.
 */
export async function loadLpRates(
  corporationIds: Iterable<number>,
  hub: TradeHub
): Promise<(corporationId: number) => LpRate> {
  const own = await ownLpValue();
  const market =
    own > 0 ? new Map<number, number | null>() : await loadMarketLpValues(corporationIds, hub);
  return (corporationId) => lpRate(own, market.get(corporationId) ?? null);
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

/** What one offer's turn-ins cost the pilot (owned ones free), or null when unknowable. */
export type LpTurnInPricer = (offer: LoyaltyStoreOffer) => number | null;

/**
 * Prices LP offers' turn-ins: every unit the pilot doesn't already hold in
 * their assets, at `hub`'s sell price. Loads the hub prices and the asset
 * snapshot (cache-first) only when some offer has turn-ins at all.
 */
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

/** `characterId` plus every other Character on the account; just `characterId` if the table can't be read. */
async function accountCharacterIds(characterId: number | null): Promise<number[]> {
  const others = await db.characters
    .toArray()
    .then((characters) => characters.map((c) => c.characterId))
    .catch(() => [] as number[]);
  return [...new Set([...(characterId === null ? [] : [characterId]), ...others])];
}

/**
 * Every LP offer any of the account's Characters could redeem for `ids`,
 * one entry per distinct corp offer. An alt's LP counts: the copy it buys
 * can be handed to whoever builds — the same reach the Market-Wide scan's
 * "LP store" source has.
 */
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

/** The lowest sell anywhere in each blueprint's market region — its Global Market Region when it has one. */
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

/**
 * Loads every market and LP Store offer for `blueprintTypeIds`. Best-effort
 * throughout: any source that cannot be read contributes no offers rather
 * than failing the plan's pricing.
 */
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
  const [turnIns, rateFor] = await Promise.all([
    loadLpTurnInPricer(
      hub,
      matches.map((match) => match.offer)
    ),
    loadLpRates(
      matches.map((match) => match.corporationId),
      hub
    ),
  ]);

  const byType = new Map<number, BpcOffer[]>();
  for (const typeId of ids) {
    const offers: BpcOffer[] = [];
    const sell = marketSellOffer(market.get(typeId) ?? null);
    if (sell) offers.push(sell);
    for (const { offer, corporationId } of lpByType.get(typeId) ?? []) {
      const turnInsCost = turnIns(offer);
      const { rate } = rateFor(corporationId);
      if (turnInsCost === null || (rate === null && offer.lp_cost > 0)) continue;
      const redemption = lpRedemptionOffer(
        { quantity: offer.quantity, requiredItems: [] },
        lpPickPrice(offer.isk_cost, offer.lp_cost, rate) + turnInsCost,
        () => undefined,
        () => 0
      );
      if (redemption) offers.push(redemption);
    }
    if (offers.length > 0) byType.set(typeId, offers);
  }
  return (blueprintTypeID) => byType.get(blueprintTypeID) ?? NO_OFFERS;
}

/**
 * What one LP Store redemption costs as a blueprint pick — the price an LP
 * Store "Plan in Industry" seeds the plan with (`parseBlueprintPriceSeed`).
 * Priced exactly as automatic selection and the modal price it: ISK + LP ×
 * its LP Value + the turn-ins the pilot doesn't already own, at `hub`.
 * `null` when a turn-in still to buy has no price, or nothing prices the LP.
 */
export async function lpBlueprintPickPrice(
  offer: LoyaltyStoreOffer,
  corporationId: number,
  hub: TradeHub
): Promise<number | null> {
  const [rateFor, turnIns] = await Promise.all([
    loadLpRates([corporationId], hub),
    loadLpTurnInPricer(hub, [offer]),
  ]);
  const turnInsCost = turnIns(offer);
  const { rate } = rateFor(corporationId);
  if (turnInsCost === null || (rate === null && offer.lp_cost > 0)) return null;
  return lpPickPrice(offer.isk_cost, offer.lp_cost, rate) + turnInsCost;
}

/** `useBlueprintPurchaseOffers`' result: the offers, and whether they are the ones for the current inputs. */
export interface BlueprintPurchaseOffersState {
  offersFor: BlueprintOffersLookup;
  /** False until the load for the current inputs lands — the plan's blueprint prices are provisional until then. */
  ready: boolean;
}

/**
 * `loadBlueprintPurchaseOffers` for a page. Reloads when the Character, hub,
 * blueprints or LP Value change; until the new load lands it keeps serving
 * the last one (so a price doesn't blank and come back) but reports
 * `ready: false`.
 */
export function useBlueprintPurchaseOffers(
  characterId: number | null,
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): BlueprintPurchaseOffersState {
  const rate = useLpValue((state) => state.value);
  const idsKey = [...new Set(blueprintTypeIds)].sort((a, b) => a - b).join(',');
  const key = `${characterId ?? ''}|${hub.id}|${rate}|${idsKey}`;
  const [loaded, setLoaded] = useState<{ key: string; lookup: BlueprintOffersLookup } | null>(null);
  const ids = useMemo(() => (idsKey === '' ? [] : idsKey.split(',').map(Number)), [idsKey]);
  useEffect(() => {
    let cancelled = false;
    void loadBlueprintPurchaseOffers(characterId, hub, ids)
      .catch(() => NO_BLUEPRINT_PURCHASE_OFFERS)
      .then((lookup) => {
        if (!cancelled) setLoaded({ key, lookup });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes everything the load reads
  }, [key]);
  return useMemo(
    () => ({
      offersFor: loaded?.lookup ?? NO_BLUEPRINT_PURCHASE_OFFERS,
      ready: loaded?.key === key,
    }),
    [loaded, key]
  );
}
