/**
 * Contract ask estimate (issue #6431): what a hull that trades only by public
 * contract (a Titan, a supercarrier) is roughly worth, from the Public
 * Contract Offers snapshot. The median per-unit ask of clean single-item
 * contracts, only when at least five back it. Asks are listings, not sales,
 * so the figure is shown marked, never inside a total or Net worth (decision
 * 20261118-contract-ask-estimate-stays-out-of-totals). Pure.
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { offerUnitPrice } from '@/engine/contracts/contractSearch';
import { median } from '@/engine/math';

/** Clean contracts a type needs before its median is shown; below it the row stays a dash. */
export const MIN_ASK_ESTIMATE_CONTRACTS = 5;

export interface ContractAskEstimate {
  typeId: number;
  /** Median ISK asked per unit. */
  unitPrice: number;
  /** Clean contracts behind it. */
  contracts: number;
}

/**
 * A single-item contract asking a real ISK price (or a buyout) for a plain
 * item: no zero-price barter, item swap, PLEX ask, bundle, blueprint, or one
 * already expired. A row with no `lineCount` is unknown, not single-line.
 */
function cleanUnitAsk(row: PublicContractOfferRow, now: number): number | undefined {
  if (row.requestsItems || row.isBlueprintCopy || row.me !== undefined) return undefined;
  if (row.dateExpired <= now) return undefined;
  // An auction with no buyout has only a starting bid, which is not an ask.
  if (row.isAuction && !(row.buyout != null && row.buyout > 0)) return undefined;
  return offerUnitPrice(row, null);
}

/** One estimate per type with enough clean asks. */
export function contractAskEstimates(
  offers: readonly PublicContractOfferRow[],
  now: number = Date.now()
): Map<number, ContractAskEstimate> {
  const asksByType = new Map<number, number[]>();
  for (const row of offers) {
    const ask = cleanUnitAsk(row, now);
    if (ask === undefined) continue;
    const list = asksByType.get(row.typeId);
    if (list) list.push(ask);
    else asksByType.set(row.typeId, [ask]);
  }
  const estimates = new Map<number, ContractAskEstimate>();
  for (const [typeId, asks] of asksByType) {
    if (asks.length < MIN_ASK_ESTIMATE_CONTRACTS) continue;
    estimates.set(typeId, { typeId, unitPrice: median(asks), contracts: asks.length });
  }
  return estimates;
}

/**
 * The owned types worth looking up: no market average price, not a blueprint
 * copy (valued from its own contracts) and not an abyssal module (its own
 * estimate). Each type once, in first-seen order.
 */
export function askEstimateCandidateTypeIds(
  assets: readonly { type_id: number; is_blueprint_copy?: boolean }[],
  priceByTypeId: ReadonlyMap<number, number>,
  isAbyssalType: ((typeId: number) => boolean) | null
): number[] {
  const seen = new Set<number>();
  for (const asset of assets) {
    if (asset.is_blueprint_copy) continue;
    if ((priceByTypeId.get(asset.type_id) ?? 0) > 0) continue;
    if (isAbyssalType?.(asset.type_id)) continue;
    seen.add(asset.type_id);
  }
  return [...seen];
}

/** The owned stacks of `assets` carrying an ask estimate, and what they add up to (never part of a total). */
export interface AskEstimateSummary {
  /** Stacks (assets) with an estimate. */
  stacks: number;
  /** Sum of unit ask median x quantity. */
  value: number;
}

export function summarizeAskEstimates(
  assets: readonly { type_id: number; quantity: number; item_id: number }[],
  estimates: ReadonlyMap<number, ContractAskEstimate>,
  /** Items already valued on their own (copies, abyssal modules) never take an ask estimate. */
  itemValueByItemId: ReadonlyMap<number, number>
): AskEstimateSummary {
  let stacks = 0;
  let value = 0;
  for (const asset of assets) {
    const estimate = estimates.get(asset.type_id);
    if (!estimate || itemValueByItemId.has(asset.item_id)) continue;
    stacks += 1;
    value += estimate.unitPrice * asset.quantity;
  }
  return { stacks, value };
}
