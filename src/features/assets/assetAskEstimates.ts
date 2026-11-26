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
