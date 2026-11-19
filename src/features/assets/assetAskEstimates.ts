/**
 * Loads contract ask estimates (issue #6431) for the owned types that have no
 * market price: the Public Contract Offers index first (a type with fewer than
 * the minimum offers is never downloaded), then only the shards of the rest.
 * Best-effort: no snapshot means no estimates, never a failed page.
 */
import {
  contractAskEstimates,
  MIN_ASK_ESTIMATE_CONTRACTS,
  type ContractAskEstimate,
} from '@/engine/contracts/askEstimate';
import {
  loadOfferIndex,
  loadOffersForTypes,
} from '@/features/contractSearch/publicContractOfferIndex';

export async function loadAssetAskEstimates(
  typeIds: readonly number[],
  load: {
    index: typeof loadOfferIndex;
    offers: typeof loadOffersForTypes;
  } = { index: loadOfferIndex, offers: loadOffersForTypes }
): Promise<Map<number, ContractAskEstimate>> {
  if (typeIds.length === 0) return new Map();
  try {
    const index = await load.index();
    if (!index) return new Map();
    const worth = new Set(
      typeIds.filter((id) => (index.types.get(id)?.count ?? 0) >= MIN_ASK_ESTIMATE_CONTRACTS)
    );
    if (worth.size === 0) return new Map();
    const offers = await load.offers(index, worth);
    return offers ? contractAskEstimates(offers) : new Map();
  } catch {
    return new Map();
  }
}
