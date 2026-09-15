/**
 * Appraisal's LP-store lookup: which of the character's LP corps sell any of
 * the pasted item types, adapted into `engine/market/lpAcquisition`'s pure
 * shape. Split from `appraisalData.ts` the same way `appraisalCsv.ts` and
 * `appraisalShareData.ts` are — one focused module per concern, all wired
 * together at the route/hook layer.
 *
 * ESI has no "who sells this type" search, so the only practical way to find
 * a match is the character's own LP corps: `getCharacterLoyaltyPoints`
 * (auth-scoped) lists every corp they hold points with, and each corp's own
 * offers (`getLoyaltyStoreOffers`, public, cached like a station) are
 * fetched from there. A corp the character holds no LP with is never
 * queried — if they hold none, they could not redeem from it regardless of
 * what it sells.
 */
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID } from '@/features/character/loyalty';
import { loadCorporationName, loadLoyaltyStoreOffers } from '@/features/loyalty/store';
import type { LpStoreOfferInput } from '@/engine/market/lpAcquisition';

/** One corp's offer for a type the paste asked about, before required-items pricing. */
export interface LpOfferMatch {
  corporationId: number;
  corpName: string;
  offer: LoyaltyStoreOffer;
  playerLp: number;
}

export interface LpOfferMatchResult {
  /** typeId -> every LP corp offer that hands it out, unpriced. */
  matchesByTypeId: Map<number, LpOfferMatch[]>;
  /**
   * Every `required_items` typeID across every match, deduplicated — fold
   * these into the same `getHubPrices` batch the pasted items themselves
   * need, so a turn-in's cost is never a second network round trip.
   */
  requiredItemTypeIds: number[];
}

const EMPTY_RESULT: LpOfferMatchResult = { matchesByTypeId: new Map(), requiredItemTypeIds: [] };

/**
 * Finds every LP corp offer for any of `typeIds`, across every corp the
 * character holds points with. Best-effort: a revoked loyalty scope or an
 * unreachable ESI degrades to no matches (same as an appraisal with no
 * active Character at all) rather than failing the whole appraisal.
 */
export async function findLpOfferMatches(
  characterId: number,
  typeIds: readonly number[]
): Promise<LpOfferMatchResult> {
  if (typeIds.length === 0) return EMPTY_RESULT;
  const wanted = new Set(typeIds);

  const pointsResult = await loadCharacterLoyaltyPoints(characterId);
  if (pointsResult.cached === null) return EMPTY_RESULT;

  // Paragon (EverMarks) runs no LP store of its own — see `splitEverMarks`'s
  // own doc comment — so it is never worth the extra fetch.
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

/**
 * Prices every match for one type against `prices` (typeId -> hub sell
 * price, what redeeming actually pays for a required turn-in) — the
 * `LpStoreOfferInput[]` `cheapestLpOffer` ranks. An offer with any unpriced
 * required item still comes through, unpriceable, rather than being dropped:
 * `priceLpOffer`/`cheapestLpOffer` already know how to skip those over one
 * that prices, and dropping it here would hide that skip from a caller
 * inspecting the raw matches.
 */
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
