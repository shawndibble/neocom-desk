/**
 * The Appraisal tab's arithmetic: what a pasted pile of items is worth at a
 * Trade Hub, on both sides of the order book, scaled by the pilot's chosen
 * percentage of market.
 *
 * Pure — names are resolved and prices fetched by the caller
 * (`features/market/appraisalData.ts`), because this module must not import
 * fetch, Dexie or the SDE loaders.
 *
 * Two things it is deliberate about:
 *
 * - **An unlisted side stays null.** `HubAggregate` reports "nobody is buying
 *   this" as `null`, never 0 (`market/fuzzwork.ts`, and BUG #5 in its own doc
 *   comment). `null * quantity` is 0 in JavaScript, so a total that summed
 *   blindly would quietly appraise an item nobody trades as free. A null side
 *   produces null figures on the row and is left out of that side's total;
 *   `unpricedRows` says how many rows that happened to, so the reader is told
 *   the total is over a subset rather than being shown a smaller number with
 *   no explanation.
 * - **No rounding.** The percentage is applied as `price * percent / 100`
 *   rather than `price * (percent / 100)` — the integer multiply happens
 *   first, so a whole-ISK price at a whole percentage lands exactly rather
 *   than a binary fraction below it. Everything else is left at full
 *   precision and rounded once, at the edge, by `formatIsk`.
 */

/** One resolved, priced item to appraise. Prices are per unit, at 100%. */
export interface AppraisalItem {
  typeId: number;
  name: string;
  quantity: number;
  /** Best buy order price, or null where nobody is buying. */
  buy: number | null;
  /** Best sell order price, or null where nobody is selling. */
  sell: number | null;
}

export interface AppraisalRow {
  typeId: number;
  name: string;
  quantity: number;
  buyEach: number | null;
  sellEach: number | null;
  buyTotal: number | null;
  sellTotal: number | null;
}

export interface AppraisalTotals {
  /** Summed over rows with a buy price. */
  buy: number;
  /** Summed over rows with a sell price. */
  sell: number;
  /** `sell - buy`. */
  spread: number;
  /** Rows missing a price on at least one side, so the totals are a subset. */
  unpricedRows: number;
}

export interface Appraisal {
  rows: AppraisalRow[];
  totals: AppraisalTotals;
}

function scale(price: number | null, percent: number): number | null {
  return price === null ? null : (price * percent) / 100;
}

/** Prices every item at `pricePercent` of market and totals both sides. */
export function buildAppraisal(items: readonly AppraisalItem[], pricePercent: number): Appraisal {
  const rows: AppraisalRow[] = [];
  let buy = 0;
  let sell = 0;
  let unpricedRows = 0;

  for (const item of items) {
    const buyEach = scale(item.buy, pricePercent);
    const sellEach = scale(item.sell, pricePercent);
    const buyTotal = buyEach === null ? null : buyEach * item.quantity;
    const sellTotal = sellEach === null ? null : sellEach * item.quantity;

    if (buyTotal !== null) buy += buyTotal;
    if (sellTotal !== null) sell += sellTotal;
    if (buyTotal === null || sellTotal === null) unpricedRows += 1;

    rows.push({
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      buyEach,
      sellEach,
      buyTotal,
      sellTotal,
    });
  }

  return { rows, totals: { buy, sell, spread: sell - buy, unpricedRows } };
}
