import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadCorporationName, loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import type { LpStoreOfferInput } from '@/engine/market/lpAcquisition';

export interface LpOfferMatch {
  corporationId: number;
  corpName: string;
  offer: LoyaltyStoreOffer;
  playerLp: number;
}

export interface LpOfferMatchResult {
  matchesByTypeId: Map<number, LpOfferMatch[]>;
  requiredItemTypeIds: number[];
}

const EMPTY_RESULT: LpOfferMatchResult = { matchesByTypeId: new Map(), requiredItemTypeIds: [] };

export async function findLpOfferMatches(
  characterId: number,
  typeIds: readonly number[]
): Promise<LpOfferMatchResult> {
  if (typeIds.length === 0) return EMPTY_RESULT;
  const wanted = new Set(typeIds);

  const pointsResult = await loadCharacterLoyaltyPoints(characterId);
  if (pointsResult.cached === null) return EMPTY_RESULT;

  const corps = pointsResult.cached.data.filter(
    (entry) => entry.corporation_id !== PARAGON_CORPORATION_ID && entry.loyalty_points > 0
  );

  const perCorp = await Promise.all(
    corps.map(async (corp) => {
      const offers = await loadLoyaltyStoreOffers(corp.corporation_id);
      const matching = (offers?.data ?? []).filter((offer) => wanted.has(offer.type_id));
      if (matching.length === 0) return null;
      const corpName =
        (await loadCorporationName(corp.corporation_id)) ?? `#${corp.corporation_id}`;
      return {
        corporationId: corp.corporation_id,
        corpName,
        playerLp: corp.loyalty_points,
        offers: matching,
      };
    })
  );

  const matchesByTypeId = new Map<number, LpOfferMatch[]>();
  const requiredItemTypeIds = new Set<number>();
  for (const entry of perCorp) {
    if (!entry) continue;
    for (const offer of entry.offers) {
      const existing = matchesByTypeId.get(offer.type_id) ?? [];
      existing.push({
        corporationId: entry.corporationId,
        corpName: entry.corpName,
        offer,
        playerLp: entry.playerLp,
      });
      matchesByTypeId.set(offer.type_id, existing);
      for (const required of offer.required_items) requiredItemTypeIds.add(required.type_id);
    }
  }

  return { matchesByTypeId, requiredItemTypeIds: [...requiredItemTypeIds] };
}

export function toLpOfferInputs(
  matches: readonly LpOfferMatch[],
  prices: ReadonlyMap<number, number | undefined>
): LpStoreOfferInput[] {
  return matches.map(({ corporationId, corpName, offer, playerLp }) => {
    let requiredItemsCostPerRedemption: number | null = 0;
    for (const required of offer.required_items) {
      const unitPrice = prices.get(required.type_id);
      if (unitPrice === undefined) {
        requiredItemsCostPerRedemption = null;
        break;
      }
      requiredItemsCostPerRedemption += unitPrice * required.quantity;
    }
    return {
      offerId: offer.offer_id,
      corporationId,
      corpName,
      quantityPerRedemption: offer.quantity,
      lpCostPerRedemption: offer.lp_cost,
      iskCostPerRedemption: offer.isk_cost,
      requiredItemsCostPerRedemption,
      playerLp,
    };
  });
}
