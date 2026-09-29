/**
 * The Blueprint Acquisition sources automatic tier selection reads beyond
 * public contracts: the cheapest sell order anywhere in the Trade Hub's
 * region, and every LP Store redemption the Character could make — so a plan
 * never opens with an empty blueprint price while the market or an LP Store
 * sells the blueprint.
 *
 * An LP redemption is priced ISK + LP × the pilot's LP Value (default 0) +
 * whatever turn-in items the pilot does not already hold in their assets, at
 * hub sell price (`lpRedemptionOffer`). One Fuzzwork region call covers every
 * blueprint in the plan, and the LP lookup reads only corps the Character
 * holds LP with — both cached — so this costs no per-blueprint request.
 */
import { useEffect, useMemo, useState } from 'react';
import type { BpcOffer } from '@/engine/industry/blueprintAcquisition';
import { lpRedemptionOffer, marketSellOffer } from '@/engine/industry/blueprintPurchaseOffers';
import { detectOwnedStock } from '@/engine/industry/ownedStock';
import {
  findLpOfferMatches,
  type LpOfferMatchResult,
} from '@/features/market/appraisalLpAcquisition';
import { useLpValue } from '@/features/loyalty/lpValue';
import { getHubPrices, getRegionSellPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { lpPickPrice } from './blueprintAcquisitionSources';
import type { BlueprintCatalog } from './blueprintCatalog';
import { EMPTY_OWNED_STOCK_SNAPSHOT, loadOwnedStockSnapshot } from './ownedStockDetection';

/** Every purchase offer for one blueprint type the loader found. */
export type BlueprintOffersLookup = (blueprintTypeID: number) => readonly BpcOffer[];

const NO_OFFERS: readonly BpcOffer[] = [];
export const NO_BLUEPRINT_PURCHASE_OFFERS: BlueprintOffersLookup = () => NO_OFFERS;

const NO_LP_MATCHES: LpOfferMatchResult = { matchesByTypeId: new Map(), requiredItemTypeIds: [] };

/** The blueprint typeIDs among a plan's `typeIds` (`buildPlanTypeIds` mixes them with materials). */
export function blueprintTypeIdsIn(
  typeIds: readonly number[],
  catalog: Pick<BlueprintCatalog, 'byBlueprintTypeID'>
): number[] {
  return typeIds.filter((typeId) => catalog.byBlueprintTypeID.has(typeId));
}

async function lpValue(): Promise<number> {
  try {
    await useLpValue.getState().hydrate();
  } catch {
    // An unreadable setting is the default rate, as everywhere else.
  }
  return useLpValue.getState().value;
}

/**
 * Loads every region-market and LP Store offer for `blueprintTypeIds`.
 * Best-effort throughout: any source that cannot be read contributes no
 * offers rather than failing the plan's pricing.
 */
export async function loadBlueprintPurchaseOffers(
  characterId: number | null,
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): Promise<BlueprintOffersLookup> {
  const ids = [...new Set(blueprintTypeIds)];
  if (ids.length === 0) return NO_BLUEPRINT_PURCHASE_OFFERS;

  const [regionPrices, lp, rate] = await Promise.all([
    getRegionSellPrices(hub.regionId, ids),
    characterId === null
      ? NO_LP_MATCHES
      : findLpOfferMatches(characterId, ids).catch(() => NO_LP_MATCHES),
    lpValue(),
  ]);

  const turnInIds = lp.requiredItemTypeIds;
  const [turnInPrices, owned] =
    turnInIds.length === 0
      ? [new Map(), EMPTY_OWNED_STOCK_SNAPSHOT]
      : await Promise.all([
          getHubPrices(hub, turnInIds).catch(() => new Map()),
          loadOwnedStockSnapshot().catch(() => EMPTY_OWNED_STOCK_SNAPSHOT),
        ]);
  const ownedStock = detectOwnedStock(owned.sources, new Set(turnInIds));
  const unitPriceFor = (typeId: number) => turnInPrices.get(typeId)?.sellMin ?? undefined;
  const ownedFor = (typeId: number) => ownedStock.get(typeId)?.quantity ?? 0;

  const byType = new Map<number, BpcOffer[]>();
  for (const typeId of ids) {
    const offers: BpcOffer[] = [];
    const market = marketSellOffer(regionPrices.get(typeId) ?? null);
    if (market) offers.push(market);
    for (const { offer } of lp.matchesByTypeId.get(typeId) ?? []) {
      const redemption = lpRedemptionOffer(
        {
          quantity: offer.quantity,
          requiredItems: offer.required_items.map((item) => ({
            typeId: item.type_id,
            quantity: item.quantity,
          })),
        },
        lpPickPrice(offer.isk_cost, offer.lp_cost, rate),
        unitPriceFor,
        ownedFor
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
 * Priced exactly as automatic selection prices it: ISK + LP × LP Value +
 * the turn-ins the pilot doesn't already own, at `unitPrice` (the row's own
 * hub price). `null` when a turn-in still to buy has no price.
 */
export async function lpBlueprintPickPrice(
  offer: { isk_cost: number; lp_cost: number; quantity: number },
  requiredItems: readonly { typeId: number; quantity: number; unitPrice: number | null }[]
): Promise<number | null> {
  const [rate, owned] = await Promise.all([
    lpValue(),
    requiredItems.length === 0
      ? EMPTY_OWNED_STOCK_SNAPSHOT
      : loadOwnedStockSnapshot().catch(() => EMPTY_OWNED_STOCK_SNAPSHOT),
  ]);
  const ownedStock = detectOwnedStock(
    owned.sources,
    new Set(requiredItems.map((item) => item.typeId))
  );
  const unitPrices = new Map(requiredItems.map((item) => [item.typeId, item.unitPrice]));
  const redemption = lpRedemptionOffer(
    { quantity: offer.quantity, requiredItems },
    lpPickPrice(offer.isk_cost, offer.lp_cost, rate),
    (typeId) => unitPrices.get(typeId) ?? undefined,
    (typeId) => ownedStock.get(typeId)?.quantity ?? 0
  );
  return redemption?.price ?? null;
}

/**
 * `loadBlueprintPurchaseOffers` for a page: no offers until the load lands,
 * then a lookup that stays the same object until the inputs change, so a
 * pricing memo keyed on it re-runs once.
 */
export function useBlueprintPurchaseOffers(
  characterId: number | null,
  hub: TradeHub,
  blueprintTypeIds: readonly number[]
): BlueprintOffersLookup {
  const key = `${characterId ?? ''}|${hub.id}|${[...new Set(blueprintTypeIds)].sort((a, b) => a - b).join(',')}`;
  const [loaded, setLoaded] = useState<{ key: string; lookup: BlueprintOffersLookup } | null>(null);
  const ids = useMemo(() => [...blueprintTypeIds], [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key` encodes the ids
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
  return loaded?.key === key ? loaded.lookup : NO_BLUEPRINT_PURCHASE_OFFERS;
}
