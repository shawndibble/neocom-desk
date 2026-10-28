/**
 * Below market (issues #3989, #5427): public item-exchange contracts whose
 * contents are worth more than the asking price, one entry per contract.
 *
 * A contract's lines value in two parts that never mix. `market` is each line
 * with a hub price × that price, on the one side of the book the caller chose
 * (sell orders or buy orders), no fees. `other` is the lines the market cannot
 * price — a blueprint copy, a type with no order on that side — at the
 * cheapest *other* single-type public offer of the same thing, only when at
 * least three such offers exist. Those are asking prices, not sales, so
 * `profit` is `market − asking` and `other` joins it only when the caller opts
 * in. Abyssal lines are priced by neither.
 *
 * The asking price is the contract's, once: it is repeated on every line and
 * never split (decision 20260915-093419).
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { buyoutOf, isUnpricedOffer, offerAskingPrice } from '@/engine/contracts/contractSearch';

/** How many other offers must back a contract-priced line before it counts. */
export const MIN_COMPARABLE_OFFERS = 3;

export interface BelowMarketPricing {
  /** Per-unit hub price on the chosen side of the book; missing, null or 0 is "no market". */
  prices: ReadonlyMap<number, number | null>;
  /** ISK per PLEX, for PLEX asks; null leaves PLEX-asking contracts out. */
  plexPrice: number | null;
  isAbyssalType: (typeId: number) => boolean;
}

export interface BelowMarketContract {
  contractId: number;
  /** The most valuable line: the row the Item cell names and the detail modal opens on. */
  lead: PublicContractOfferRow;
  /** For-sale line count. */
  lines: number;
  /** Lines with a hub price, and what they are worth there. */
  market: number;
  pricedLines: number;
  /** Lines valued from other contracts' asks (not in `market`), and their estimate. */
  other: number;
  otherLines: number;
  /** The weakest comparable count behind any `other` line; null when `other` is empty. */
  otherOfferCount: number | null;
  asking: number;
  /** `market − asking`, plus `other` when the list was built with `includeOther`. */
  profit: number;
  /** True when `other` is part of `profit`. */
  includesOther: boolean;
}

export interface BelowMarketOptions {
  /** List and rank contracts by `market + other − asking` too. Default off. */
  includeOther?: boolean;
}

/**
 * A contract this view may list, judged on any one of its rows (every field
 * read here is contract-level): no item asks, no auction without a buyout,
 * and a real asking price — a barter, or a PLEX ask with no PLEX price yet,
 * has none.
 */
export function isBelowMarketCandidate(
  row: PublicContractOfferRow,
  plexPrice: number | null
): boolean {
  if (row.requestsItems) return false;
  if (row.isAuction && buyoutOf(row) === null) return false;
  return !isUnpricedOffer(row, plexPrice);
}

/** Copies and abyssal lines take no market price; a copy's type price is the original's. */
function isMarketPriceable(row: PublicContractOfferRow, isAbyssalType: (id: number) => boolean) {
  return !row.isBlueprintCopy && !isAbyssalType(row.typeId);
}

/** The types whose best buy the valuation needs: market lines of candidate contracts. */
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

/** "The same thing": a copy matches blueprint and exact ME/TE; anything else matches type. */
function comparableKey(row: PublicContractOfferRow): string {
  return row.isBlueprintCopy ? `b:${row.typeId}:${row.me ?? 0}:${row.te ?? 0}` : `t:${row.typeId}`;
}

/** Units a line is priced per: runs for a copy, items otherwise. */
function units(row: PublicContractOfferRow): number {
  return row.isBlueprintCopy ? row.quantity * (row.runs ?? 0) : row.quantity;
}

/** The cheapest two per-unit asks (two, so the contract being valued can be skipped) and how many contracts ask. */
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

/**
 * One per-unit ask per single-type contract: every line the same thing, a
 * fixed price (no auctions, no PLEX, no item asks, no barters). A contract
 * that also sells the original is not single-type, since its lines differ.
 */
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

/** One contract's for-sale lines, valued into the two parts. */
interface ContractValue {
  market: number;
  pricedLines: number;
  totalLines: number;
  other: number;
  otherLines: number;
  otherOfferCount: number | null;
  lead: PublicContractOfferRow;
}

/** Values one contract's lines. Pure: `comparables` is built from the whole snapshot. */
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

/**
 * Every candidate contract worth more than it asks, best profit first.
 * `rows` must be the whole snapshot: a contract's other lines and the
 * comparable offers both live outside any filtered subset.
 */
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
