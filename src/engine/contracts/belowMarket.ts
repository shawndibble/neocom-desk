import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { buyoutOf, isUnpricedOffer, offerAskingPrice } from '@/engine/contracts/contractSearch';

export const MIN_COMPARABLE_OFFERS = 3;

export interface BelowMarketPricing {
  prices: ReadonlyMap<number, number | null>;
  plexPrice: number | null;
  isAbyssalType: (typeId: number) => boolean;
}

export interface BelowMarketContract {
  contractId: number;
  lead: PublicContractOfferRow;
  lines: number;
  market: number;
  pricedLines: number;
  other: number;
  otherLines: number;
  otherOfferCount: number | null;
  asking: number;
  profit: number;
  includesOther: boolean;
}

export interface BelowMarketOptions {
  includeOther?: boolean;
}

export function isBelowMarketCandidate(
  row: PublicContractOfferRow,
  plexPrice: number | null
): boolean {
  if (row.requestsItems) return false;
  if (row.isAuction && buyoutOf(row) === null) return false;
  return !isUnpricedOffer(row, plexPrice);
}

function isMarketPriceable(row: PublicContractOfferRow, isAbyssalType: (id: number) => boolean) {
  return !row.isBlueprintCopy && !isAbyssalType(row.typeId);
}

export function belowMarketPriceTypeIds(
  rows: readonly PublicContractOfferRow[],
  plexPrice: number | null,
  isAbyssalType: (typeId: number) => boolean
): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (isBelowMarketCandidate(row, plexPrice) && isMarketPriceable(row, isAbyssalType)) {
      ids.add(row.typeId);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function comparableKey(row: PublicContractOfferRow): string {
  return row.isBlueprintCopy ? `b:${row.typeId}:${row.me ?? 0}:${row.te ?? 0}` : `t:${row.typeId}`;
}

function units(row: PublicContractOfferRow): number {
  return row.isBlueprintCopy ? row.quantity * (row.runs ?? 0) : row.quantity;
}

interface Comparables {
  cheapest: { unit: number; contractId: number }[];
  contractIds: Set<number>;
}

function groupByContract(rows: readonly PublicContractOfferRow[]) {
  const byContract = new Map<number, PublicContractOfferRow[]>();
  for (const row of rows) {
    const lines = byContract.get(row.contractId);
    if (lines) lines.push(row);
    else byContract.set(row.contractId, [row]);
  }
  return byContract;
}

function comparablesByKey(byContract: ReadonlyMap<number, readonly PublicContractOfferRow[]>) {
  const byKey = new Map<string, Comparables>();
  for (const [contractId, lines] of byContract) {
    const first = lines[0];
    if (!first || first.isAuction || first.requestedPlex || first.requestsItems) continue;
    if (first.price <= 0) continue;
    const key = comparableKey(first);
    if (lines.some((line) => comparableKey(line) !== key)) continue;
    const total = lines.reduce((sum, line) => sum + units(line), 0);
    if (total <= 0) continue;
    const unit = first.price / total;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { cheapest: [], contractIds: new Set() };
      byKey.set(key, entry);
    }
    entry.contractIds.add(contractId);
    entry.cheapest.push({ unit, contractId });
    entry.cheapest.sort((a, b) => a.unit - b.unit);
    entry.cheapest.length = Math.min(entry.cheapest.length, 2);
  }
  return byKey;
}

interface ContractValue {
  market: number;
  pricedLines: number;
  totalLines: number;
  other: number;
  otherLines: number;
  otherOfferCount: number | null;
  lead: PublicContractOfferRow;
}

function valueContract(
  lines: readonly PublicContractOfferRow[],
  pricing: BelowMarketPricing,
  comparables: ReadonlyMap<string, Comparables>
): ContractValue {
  const result: ContractValue = {
    market: 0,
    pricedLines: 0,
    totalLines: lines.length,
    other: 0,
    otherLines: 0,
    otherOfferCount: null,
    lead: lines[0] as PublicContractOfferRow,
  };
  let leadValue = -1;
  for (const row of lines) {
    let value = 0;
    if (!pricing.isAbyssalType(row.typeId)) {
      const price = row.isBlueprintCopy ? 0 : (pricing.prices.get(row.typeId) ?? 0);
      if (price > 0) {
        value = row.quantity * price;
        result.market += value;
        result.pricedLines += 1;
      } else {
        const entry = comparables.get(comparableKey(row));
        const others = entry
          ? entry.contractIds.size - (entry.contractIds.has(row.contractId) ? 1 : 0)
          : 0;
        const floor = entry?.cheapest.find((c) => c.contractId !== row.contractId);
        if (floor && others >= MIN_COMPARABLE_OFFERS) {
          value = units(row) * floor.unit;
          result.other += value;
          result.otherLines += 1;
          result.otherOfferCount = Math.min(result.otherOfferCount ?? Infinity, others);
        }
      }
    }
    if (value > leadValue) {
      result.lead = row;
      leadValue = value;
    }
  }
  return result;
}

export function belowMarketContracts(
  rows: readonly PublicContractOfferRow[],
  pricing: BelowMarketPricing,
  options: BelowMarketOptions = {}
): BelowMarketContract[] {
  const includeOther = options.includeOther ?? false;
  const byContract = groupByContract(rows);
  const comparables = comparablesByKey(byContract);
  const out: BelowMarketContract[] = [];
  for (const [contractId, lines] of byContract) {
    const first = lines[0];
    if (!first || !isBelowMarketCandidate(first, pricing.plexPrice)) continue;
    const v = valueContract(lines, pricing, comparables);
    const asking = offerAskingPrice(first, pricing.plexPrice);
    const profit = v.market + (includeOther ? v.other : 0) - asking;
    if (profit <= 0) continue;
    out.push({
      contractId,
      lead: v.lead,
      lines: v.totalLines,
      market: v.market,
      pricedLines: v.pricedLines,
      other: v.other,
      otherLines: v.otherLines,
      otherOfferCount: v.otherOfferCount,
      asking,
      profit,
      includesOther: includeOther && v.other > 0,
    });
  }
  return out.sort((a, b) => b.profit - a.profit);
}
