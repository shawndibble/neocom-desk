import {
  effectivePrice,
  type BpcContractRow,
  type BpcSearchRow,
} from '@/engine/contracts/bpcSearch';
import type { RegionOrder } from '@/esi/endpoints';
import {
  cheapestRow,
  contractOfferRows,
  marketSellRows,
  type ContractOfferRow,
  type MarketSellRow,
} from '@/features/industry/blueprintAcquisitionSources';

export const MARKET_BPO_LOOKUP_LIMIT = 10;

export type MarketBpoOffer = MarketSellRow & { regionId: number };

export interface MarketBpoBook {
  regionId: number;
  sell: readonly RegionOrder[];
}

export type BpoOffer = ContractOfferRow | MarketBpoOffer;

export interface BpoAvailabilityInput {
  originals: readonly BpcContractRow[];
  contractRegionId: number | null;
  marketBooks: ReadonlyMap<number, MarketBpoBook>;
  hubStationId: number;
}

export function marketBpoOffers(
  orders: readonly RegionOrder[],
  regionId: number,
  hubStationId: number
): MarketBpoOffer[] {
  return marketSellRows(orders, hubStationId).map((row) => ({ ...row, regionId }));
}

export interface BpoSources {
  market: MarketBpoOffer | null;
  contract: ContractOfferRow | null;
}

export function cheapestBpoSourcesByType(
  typeIds: Iterable<number>,
  input: BpoAvailabilityInput
): Map<number, BpoSources> {
  const wanted = new Set(typeIds);
  const originalsByType = new Map<number, BpcContractRow[]>();
  for (const row of input.originals) {
    if (!wanted.has(row.typeId)) continue;
    const list = originalsByType.get(row.typeId);
    if (list) list.push(row);
    else originalsByType.set(row.typeId, [row]);
  }

  const result = new Map<number, BpoSources>();
  for (const typeId of wanted) {
    const originals = originalsByType.get(typeId);
    const contract = originals
      ? cheapestRow(
          contractOfferRows({
            copies: [],
            originals,
            blueprintTypeID: typeId,
            regionId: input.contractRegionId,
          })
        )
      : null;
    const book = input.marketBooks.get(typeId);
    const market = book
      ? cheapestRow(marketBpoOffers(book.sell, book.regionId, input.hubStationId))
      : null;
    if (market || contract) result.set(typeId, { market, contract });
  }
  return result;
}

export function cheaperBpo({ market, contract }: BpoSources): BpoOffer | null {
  return market && (!contract || market.price < contract.price) ? market : contract;
}

export function cheapestComparableCopy(rows: readonly BpcContractRow[]): BpcContractRow | null {
  let best: BpcContractRow | null = null;
  for (const row of rows) {
    if (row.isMultiType || !(effectivePrice(row) > 0)) continue;
    if (!best || effectivePrice(row) < effectivePrice(best)) best = row;
  }
  return best;
}

export function bpoBadgeRows(rows: readonly BpcSearchRow[]): Set<BpcSearchRow> {
  const byType = new Map<number, BpcSearchRow>();
  const price = (row: BpcSearchRow) =>
    row.source === 'contract' && !row.contract.isMultiType ? effectivePrice(row.contract) : 0;
  for (const row of rows) {
    if (row.runs === -1 || row.source === 'lp' || row.source === 'community') continue;
    const current = byType.get(row.typeId);
    if (!current) {
      byType.set(row.typeId, row);
      continue;
    }
    const candidate = price(row);
    if (candidate > 0 && (!(price(current) > 0) || candidate < price(current))) {
      byType.set(row.typeId, row);
    }
  }
  return new Set(byType.values());
}

export function bpoMayBeCheaper(
  bpo: { price: number } | null | undefined,
  offer: BpcContractRow
): boolean {
  if (!bpo || !(bpo.price > 0) || offer.isMultiType) return false;
  const offerPrice = effectivePrice(offer);
  return offerPrice > 0 && bpo.price <= offerPrice;
}

export function cheapestSourcingCard(
  regionCheapest: number | null,
  bpos: readonly Pick<BpoOffer, 'kind' | 'price'>[]
): 'region' | BpoOffer['kind'] | null {
  const boxes = (regionCheapest === null ? 0 : 1) + bpos.length;
  if (boxes < 2) return null;
  let winner: 'region' | BpoOffer['kind'] | null = regionCheapest === null ? null : 'region';
  let best = regionCheapest ?? Infinity;
  for (const bpo of bpos) {
    if (bpo.price < best) {
      best = bpo.price;
      winner = bpo.kind;
    }
  }
  return winner;
}
