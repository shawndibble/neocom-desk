/**
 * The Items board's price flags (issue #4773): an item contract asking far
 * above the hub sell, or a blueprint copy asking more than its original.
 *
 * A flag states a condition and its multiple, never a verdict
 * (`20260912-172628-courier-risk-flags-state-a-condition-never-a.md`), and
 * stays silent when it cannot tell: no hub price yet, a barter, an auction
 * with no buyout, a contract that also asks for items, or one with other
 * lines, or one whose line count is unknown (`row.typeCount` absent: a
 * snapshot from before the field). The bundle case follows
 * `20260915-093419-multi-type-contract-price-treated-as-unknowable-never.md`:
 * one price pays for every line, so the row alone cannot call it overpriced.
 */
import type { PublicContractOfferRow } from './contractOffers';
import { buyoutOf, isUnpricedOffer } from './contractSearch';

/** Proposed default, and Market Browser's `SELL_OUTLIER_FACTOR`. */
export const DEFAULT_ITEM_FLAG_MULTIPLE = 10;

export type ContractFlag =
  | { kind: 'overpriced'; multiple: number; hubSell: number; quantity: number }
  | { kind: 'copy-above-original'; original: number; asking: number; runs?: number };

export interface ContractFlagContext {
  /** The hub's best sell for the row's type; `null` while unpriced. For a copy, the original's. */
  hubSell: number | null;
  /** Times the hub sell an item may ask before it is flagged. */
  threshold: number;
}

/**
 * Signals 1 and 2. A blueprint copy is held against the original's hub price,
 * anything else against the hub sell of every unit the contract carries.
 */
export function contractFlagFor(
  row: PublicContractOfferRow,
  { hubSell, threshold }: ContractFlagContext
): ContractFlag | null {
  if (row.typeCount !== 1 || hubSell === null || hubSell <= 0) return null;
  if (row.requestsItems || isUnpricedOffer(row)) return null;
  // An auction's `price` is a starting bid, so only a buyout is an ask.
  if (row.isAuction && buyoutOf(row) === null) return null;
  const asking = buyoutOf(row) ?? row.price;
  if (row.isBlueprintCopy) {
    return asking > hubSell
      ? {
          kind: 'copy-above-original',
          original: hubSell,
          asking,
          ...(row.runs === undefined ? {} : { runs: row.runs }),
        }
      : null;
  }
  const multiple = asking / (hubSell * row.quantity);
  return multiple >= threshold
    ? { kind: 'overpriced', multiple, hubSell, quantity: row.quantity }
    : null;
}

/** `rows` without the ones `flagOf` flags, in the order given. */
export function hideFlagged<T>(rows: readonly T[], flagOf: (row: T) => ContractFlag | null): T[] {
  return rows.filter((row) => flagOf(row) === null);
}

/** How many rows `hideFlagged` would drop, for the "N hidden" line. */
export function countFlagged<T>(
  rows: readonly T[],
  flagOf: (row: T) => ContractFlag | null
): number {
  return rows.length - hideFlagged(rows, flagOf).length;
}

/** A searched line worth less than this share of its contract's value is the minority of a padded bundle. */
export const BUNDLE_MINORITY_SHARE = 0.5;

/**
 * The searched lines' share of a contract's value at the hub: the padded-bundle
 * sentence. `null` when any line has no hub price, since the share would then
 * be a guess, or when nothing is priced.
 */
export function bundleShareOfValue(split: {
  mine: number;
  rest: number;
  unpricedLines: number;
}): number | null {
  const total = split.mine + split.rest;
  if (split.unpricedLines > 0 || total <= 0) return null;
  return split.mine / total;
}
