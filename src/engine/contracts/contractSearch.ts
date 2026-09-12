/**
 * Pure search over the shared Public Contract Offers snapshot — every
 * for-sale line of a public item_exchange/auction contract, any item type
 * (issues #906, #908). The general-corpus sibling of `bpcSearch.ts`, which
 * answers the narrower "which blueprint copy should I buy" question and
 * carries ME/TE/runs dimensions that mean nothing to a stack of Tritanium.
 *
 * Kept separate rather than generalizing `bpcSearch.ts`: the two filters
 * share only type/region/price, and folding blueprint-only dimensions into a
 * filter most rows cannot answer is how a shared filter becomes a filter with
 * a mode flag. Sorting is left to `DataTable`'s column sort, same as there —
 * this only narrows the row set.
 */
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';

/** How the seller priced it: a fixed ask, or bids-with-optional-buyout. */
export type ContractSaleKind = 'exchange' | 'auction';

export interface ContractOfferFilter {
  /**
   * `null`/`undefined` means "no type search active" (every row passes). An
   * empty-but-present `Set` means a search ran and matched nothing — that
   * must filter down to zero rows, not be mistaken for "unfiltered". Same
   * contract `BpcSearchFilter.typeIds` makes.
   */
  typeIds?: ReadonlySet<number> | null;
  regionId?: number | null;
  maxPrice?: number | null;
  /** Lets a buyer skip the single-unit listings when they want a stack. */
  minQuantity?: number | null;
  saleKind?: ContractSaleKind | null;
}

/**
 * A row's `buyout` is only meaningful on an auction. EVE Ref emits `buyout:
 * 0` on plain item_exchange rows, so a reader that took `buyout ?? price`
 * unconditionally would price every fixed-ask contract at zero — which is
 * both the wrong number to show and, as a ceiling, the wrong row to keep.
 */
function buyoutOf(row: PublicContractOfferRow): number | null {
  if (!row.isAuction) return null;
  // `> 0`, not just present: the sync writes whatever the archive's `buyout`
  // column parses to and only treats a blank as absent, so a zero reaches
  // here as a real number. Zero is not a price a seller set — read as one it
  // would show the row as free and let it under every ceiling.
  return row.buyout != null && row.buyout > 0 ? row.buyout : null;
}

/**
 * What a row costs a buyer, and the single expression every price readout
 * agrees on — the table's price column sorts on this, so a "cheapest" figure
 * computed any other way would name a number the first row beneath it
 * contradicts. For an auction with no buyout the starting bid is the only
 * figure there is.
 */
export function offerAskingPrice(row: PublicContractOfferRow): number {
  return buyoutOf(row) ?? row.price;
}

/**
 * What a `maxPrice` ceiling judges a row on — deliberately not
 * `offerAskingPrice`, which answers a different question. This one asks
 * "could this row exceed my ceiling": an auction's starting bid says nothing
 * about that, so only a buyout can disqualify it, and an auction with no
 * buyout has an unknowable eventual price and passes rather than being
 * excluded on a number that does not describe it.
 */
function priceForMaxFilter(row: PublicContractOfferRow): number | null {
  if (!row.isAuction) return row.price;
  return buyoutOf(row);
}

export function filterContractOffers(
  rows: readonly PublicContractOfferRow[],
  filter: ContractOfferFilter
): PublicContractOfferRow[] {
  return rows.filter((row) => {
    if (filter.typeIds && !filter.typeIds.has(row.typeId)) return false;
    if (filter.regionId != null && row.regionId !== filter.regionId) return false;
    if (filter.minQuantity != null && row.quantity < filter.minQuantity) return false;
    if (filter.saleKind != null && (row.isAuction ? 'auction' : 'exchange') !== filter.saleKind) {
      return false;
    }
    if (filter.maxPrice != null) {
      const price = priceForMaxFilter(row);
      if (price != null && price > filter.maxPrice) return false;
    }
    return true;
  });
}

export interface ContractTypeOption {
  typeId: number;
  name: string;
}

/**
 * Distinct item types actually present in the loaded rows, named and sorted —
 * the item search's corpus. Deliberately narrower than the whole market
 * catalogue: search only what is actually on contract right now, so a query
 * never offers a type with zero results, and the corpus stays small enough
 * that `rankedSearch`'s result cap is never the reason a real match goes
 * missing.
 */
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

/**
 * What one item type's listings look like in aggregate, for the search's
 * suggestion rows. An **offer** is one contract line, which is not one unit:
 * a single line can put `quantity: 500` up at one price. Counting lines is
 * what the buyer is choosing between, so that is what this counts.
 */
export interface ContractOfferStats {
  offerCount: number;
  cheapest: number;
}

/**
 * One pass over the rows, keyed by type. The suggestion list needs a count
 * and a cheapest per candidate on every keystroke; re-filtering the whole
 * snapshot per suggestion is the shape that turns a typeahead into a stutter.
 *
 * Takes an already-narrowed row set rather than reaching for the whole
 * snapshot, so a suggestion reading "40 offers" cannot be followed by a
 * summary reading "2".
 */
export function contractOfferStats(
  rows: readonly PublicContractOfferRow[]
): Map<number, ContractOfferStats> {
  const stats = new Map<number, ContractOfferStats>();
  for (const row of rows) {
    const price = offerAskingPrice(row);
    const existing = stats.get(row.typeId);
    if (!existing) {
      stats.set(row.typeId, { offerCount: 1, cheapest: price });
      continue;
    }
    existing.offerCount += 1;
    if (price < existing.cheapest) existing.cheapest = price;
  }
  return stats;
}

/** The headline numbers once the search narrows to a single item type. */
export interface ContractOfferPriceSummary {
  offerCount: number;
  /** `null` for no offers — distinct from `0`, which would read as a free item. */
  cheapest: number | null;
  median: number | null;
}

/**
 * Median rather than mean: a handful of 500-unit stacks among single-unit
 * listings drags an average somewhere no actual contract sits, which is
 * exactly the number a buyer would misread as "the going rate".
 */
export function contractOfferPriceSummary(
  rows: readonly PublicContractOfferRow[]
): ContractOfferPriceSummary {
  if (rows.length === 0) return { offerCount: 0, cheapest: null, median: null };
  const prices = rows.map(offerAskingPrice).sort((a, b) => a - b);
  const middle = prices.length >> 1;
  const median =
    prices.length % 2 === 1 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return { offerCount: rows.length, cheapest: prices[0], median };
}
