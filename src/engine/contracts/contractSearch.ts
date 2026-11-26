import { median } from '../math';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

export interface ContractOfferFilter {
  typeIds?: ReadonlySet<number> | null;
  regionId?: number | null;
  maxPrice?: number | null;
  minQuantity?: number | null;
  hideExchanges?: boolean | null;
  hideAuctions?: boolean | null;
  hidePlexRequests?: boolean | null;
  plexPrice?: number | null;
}

export function buyoutOf(row: PublicContractOfferRow): number | null {
  if (!row.isAuction) return null;
  return row.buyout != null && row.buyout > 0 ? row.buyout : null;
}

export function offerAskingPrice(
  row: PublicContractOfferRow,
  plexPrice: number | null = null
): number {
  const isk = buyoutOf(row) ?? row.price;
  return row.requestedPlex && plexPrice != null ? isk + row.requestedPlex * plexPrice : isk;
}

export function isUnpricedOffer(
  row: PublicContractOfferRow,
  plexPrice: number | null = null
): boolean {
  if (row.requestedPlex && plexPrice == null) return true;
  return offerAskingPrice(row, plexPrice) <= 0;
}

export function offerUnitPrice(
  row: PublicContractOfferRow,
  plexPrice: number | null
): number | undefined {
  if (row.lineCount !== 1 || row.quantity <= 0) return undefined;
  if (isUnpricedOffer(row, plexPrice)) return undefined;
  return offerAskingPrice(row, plexPrice) / row.quantity;
}

function priceForMaxFilter(row: PublicContractOfferRow, plexPrice: number | null): number | null {
  const isk = row.isAuction ? buyoutOf(row) : row.price;
  if (isk === null || !row.requestedPlex) return isk;
  return plexPrice == null ? null : isk + row.requestedPlex * plexPrice;
}

export function offerPassesFilter(
  row: PublicContractOfferRow,
  filter: ContractOfferFilter
): boolean {
  if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
  if (filter.regionId != null && row.regionId !== filter.regionId) return false;
  if (filter.minQuantity != null && row.quantity < filter.minQuantity) return false;
  if (filter.hideExchanges && !row.isAuction) return false;
  if (filter.hideAuctions && row.isAuction) return false;
  if (filter.hidePlexRequests && row.requestedPlex) return false;
  if (filter.maxPrice != null) {
    const price = priceForMaxFilter(row, filter.plexPrice ?? null);
    if (price != null && price > filter.maxPrice) return false;
  }
  return true;
}

export function filterContractOffers(
  rows: readonly PublicContractOfferRow[],
  filter: ContractOfferFilter
): PublicContractOfferRow[] {
  return rows.filter((row) => offerPassesFilter(row, filter));
}

export function sortableOfferPrice(row: PublicContractOfferRow, plexPrice: number | null): number {
  return isUnpricedOffer(row, plexPrice) ? Infinity : offerAskingPrice(row, plexPrice);
}

export interface ContractTypeOption {
  typeId: number;
  name: string;
}

export function listedContractTypeOptions(
  rows: readonly { typeId: number }[],
  typeNames: ReadonlyMap<number, string>
): ContractTypeOption[] {
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (seen.has(row.typeId)) continue;
    seen.set(row.typeId, typeNames.get(row.typeId) ?? `#${row.typeId}`);
  }
  return [...seen.entries()]
    .map(([typeId, name]) => ({ typeId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface ContractOfferStats {
  offerCount: number;
  cheapest: number | null;
}

export function contractOfferStats(
  rows: readonly PublicContractOfferRow[],
  plexPrice: number | null = null
): Map<number, ContractOfferStats> {
  const stats = new Map<number, ContractOfferStats>();
  for (const row of rows) addToOfferStats(stats, row, plexPrice);
  return stats;
}

export function addToOfferStats(
  stats: Map<number, ContractOfferStats>,
  row: PublicContractOfferRow,
  plexPrice: number | null
): void {
  const unpriced = isUnpricedOffer(row, plexPrice);
  const price = offerAskingPrice(row, plexPrice);
  const existing = stats.get(row.typeId);
  if (!existing) {
    stats.set(row.typeId, { offerCount: 1, cheapest: unpriced ? null : price });
    return;
  }
  existing.offerCount += 1;
  if (!unpriced && (existing.cheapest === null || price < existing.cheapest)) {
    existing.cheapest = price;
  }
}

export interface ContractOfferPriceSummary {
  offerCount: number;
  cheapest: number | null;
  median: number | null;
}

export function contractOfferPriceSummary(
  rows: readonly PublicContractOfferRow[],
  plexPrice: number | null = null
): ContractOfferPriceSummary {
  if (rows.length === 0) return { offerCount: 0, cheapest: null, median: null };
  const prices = rows
    .filter((row) => !isUnpricedOffer(row, plexPrice))
    .map((row) => offerAskingPrice(row, plexPrice))
    .sort((a, b) => a - b);
  if (prices.length === 0) return { offerCount: rows.length, cheapest: null, median: null };
  return { offerCount: rows.length, cheapest: prices[0], median: median(prices) };
}
