/**
 * Below market (issue #3989): public item-exchange contracts whose contents
 * are worth more than the asking price, one entry per contract.
 *
 * Value is what a pilot gets selling everything at once: each line × the
 * default Trade Hub's best buy, minus sales tax. A line with no market — a
 * blueprint copy, or a type with no buy order — is valued at the cheapest
 * *other* single-type public offer of the same thing, and only when at least
 * three such offers exist; otherwise 0. That is a resale floor the pilot must
 * undercut, not the median asset estimate Assets uses for copies — see the
 * #3989 scope decision. Abyssal lines are always 0.
 *
 * The asking price is the contract's, once: it is repeated on every line and
 * never split (decision 20260915-093419).
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { buyoutOf, isUnpricedOffer, offerAskingPrice } from '@/engine/contracts/contractSearch';

/** How many other offers must back a contract-priced line before it counts. */
export const MIN_COMPARABLE_OFFERS = 3;

export interface BelowMarketPricing {
  /** Best buy per unit at the default Trade Hub; missing, null or 0 is "no market". */
  bestBuy: ReadonlyMap<number, number | null>;
  /** Sales tax, percent (`engine/industry/fees.ts` `salesTaxPct`). */
  salesTaxPct: number;
  /** ISK per PLEX, for PLEX asks; null leaves PLEX-asking contracts out. */
  plexPrice: number | null;
  isAbyssalType: (typeId: number) => boolean;
}

/** Where a contract's value came from. `offers` names the weakest comparable count behind any contract-priced line. */
export type BelowMarketSource = { kind: 'market' } | { kind: 'offers'; offerCount: number };

export interface BelowMarketContract {
  contractId: number;
  /** The most valuable line: the row the Item cell names and the detail modal opens on. */
  lead: PublicContractOfferRow;
  /** For-sale line count. */
  lines: number;
  value: number;
  asking: number;
  profit: number;
  source: BelowMarketSource;
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

interface LineValue {
  value: number;
  /** Comparable count when priced from offers; absent when priced at market (or 0). */
  offerCount?: number;
}

function lineValue(
  row: PublicContractOfferRow,
  pricing: BelowMarketPricing,
  comparables: ReadonlyMap<string, Comparables>
): LineValue {
  if (pricing.isAbyssalType(row.typeId)) return { value: 0 };
  if (!row.isBlueprintCopy) {
    const bestBuy = pricing.bestBuy.get(row.typeId) ?? 0;
    if (bestBuy > 0) {
      return { value: row.quantity * bestBuy * (1 - pricing.salesTaxPct / 100) };
    }
  }
  const entry = comparables.get(comparableKey(row));
  if (!entry) return { value: 0 };
  const others = entry.contractIds.size - (entry.contractIds.has(row.contractId) ? 1 : 0);
  const floor = entry.cheapest.find((c) => c.contractId !== row.contractId);
  if (others < MIN_COMPARABLE_OFFERS || !floor) return { value: 0 };
  return { value: units(row) * floor.unit, offerCount: others };
}

/**
 * Every candidate contract worth more than it asks, best profit first.
 * `rows` must be the whole snapshot: a contract's other lines and the
 * comparable offers both live outside any filtered subset.
 */
export function belowMarketContracts(
  rows: readonly PublicContractOfferRow[],
  pricing: BelowMarketPricing
): BelowMarketContract[] {
  const byContract = groupByContract(rows);
  const comparables = comparablesByKey(byContract);
  const out: BelowMarketContract[] = [];
  for (const [contractId, lines] of byContract) {
    const first = lines[0];
    if (!first || !isBelowMarketCandidate(first, pricing.plexPrice)) continue;
    let value = 0;
    let lead = first;
    let leadValue = -1;
    let offerCount: number | null = null;
    for (const line of lines) {
      const priced = lineValue(line, pricing, comparables);
      value += priced.value;
      if (priced.value > leadValue) {
        lead = line;
        leadValue = priced.value;
      }
      if (priced.offerCount !== undefined) {
        offerCount = Math.min(offerCount ?? Infinity, priced.offerCount);
      }
    }
    const asking = offerAskingPrice(first, pricing.plexPrice);
    const profit = value - asking;
    if (profit <= 0) continue;
    out.push({
      contractId,
      lead,
      lines: lines.length,
      value,
      asking,
      profit,
      source: offerCount === null ? { kind: 'market' } : { kind: 'offers', offerCount },
    });
  }
  return out.sort((a, b) => b.profit - a.profit);
}
