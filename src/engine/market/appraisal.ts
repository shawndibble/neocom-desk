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
 *
 * Refine-then-sell (issue #672) rides alongside the sell-as-is figures on the
 * same rows and totals, rather than as a parallel `Appraisal`, so the two are
 * always compared over the same priced quantity. It reuses
 * `src/engine/industry/reprocessing.ts` wholesale — this module supplies only
 * `computeAppraisalRefine`, the glue that turns one resolved item plus a
 * character's skills and material prices into the same
 * `{ total, pricedAll }` shape `reprocessingValue` already established, so
 * `buildAppraisal` can scale and total it exactly like buy/sell. A type with
 * no reprocessing data carries no `refine` field at all, distinguishing "no
 * comparison exists" from "the comparison is worth nothing" (a part-portion
 * quantity, which is a real, reportable zero).
 */
import {
  reprocessingEfficiency,
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
  type ReprocessingSkills,
} from '@/engine/industry/reprocessing';

/** Refine-then-sell value for one item's full pasted quantity, at 100% price. */
export interface AppraisalRefine {
  /** What the priced output materials fetch. Never counts an unpriced material as free. */
  valueAtFullPrice: number;
  /** False when at least one output material had no price at this hub. */
  pricedAll: boolean;
  /** Units that could not fill a whole reprocessing portion, and so refined into nothing. */
  unitsLeftOver: number;
}

/** One resolved, priced item to appraise. Prices are per unit, at 100%. */
export interface AppraisalItem {
  typeId: number;
  name: string;
  quantity: number;
  /** Best buy order price, or null where nobody is buying. */
  buy: number | null;
  /** Best sell order price, or null where nobody is selling. */
  sell: number | null;
  /** Undefined when this type carries no reprocessing data at all. */
  refine?: AppraisalRefine;
}

export interface AppraisalRow {
  typeId: number;
  name: string;
  quantity: number;
  buyEach: number | null;
  sellEach: number | null;
  buyTotal: number | null;
  sellTotal: number | null;
  /** Undefined when this type carries no reprocessing data at all. */
  refineTotal?: number;
  refinePricedAll?: boolean;
  refineUnitsLeftOver?: number;
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
  /** Summed over rows carrying reprocessing data, whatever their pricing. */
  refine: number;
  /** Rows with reprocessing data where at least one output material had no price. */
  refineUnpricedRows: number;
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
  let refine = 0;
  let refineUnpricedRows = 0;

  for (const item of items) {
    const buyEach = scale(item.buy, pricePercent);
    const sellEach = scale(item.sell, pricePercent);
    const buyTotal = buyEach === null ? null : buyEach * item.quantity;
    const sellTotal = sellEach === null ? null : sellEach * item.quantity;

    if (buyTotal !== null) buy += buyTotal;
    if (sellTotal !== null) sell += sellTotal;
    if (buyTotal === null || sellTotal === null) unpricedRows += 1;

    let refineTotal: number | undefined;
    let refinePricedAll: boolean | undefined;
    let refineUnitsLeftOver: number | undefined;
    if (item.refine) {
      refineTotal = (item.refine.valueAtFullPrice * pricePercent) / 100;
      refinePricedAll = item.refine.pricedAll;
      refineUnitsLeftOver = item.refine.unitsLeftOver;
      refine += refineTotal;
      if (!refinePricedAll) refineUnpricedRows += 1;
    }

    rows.push({
      typeId: item.typeId,
      name: item.name,
      quantity: item.quantity,
      buyEach,
      sellEach,
      buyTotal,
      sellTotal,
      refineTotal,
      refinePricedAll,
      refineUnitsLeftOver,
    });
  }

  return {
    rows,
    totals: { buy, sell, spread: sell - buy, unpricedRows, refine, refineUnpricedRows },
  };
}

/** One Trade Hub's row in the Compare Hubs table: both sides, at the given percentage. */
export interface HubComparisonTotals {
  /** Null when nothing among the items has a buy price at this hub — a dash, not a 0. */
  buy: number | null;
  /** Null when nothing among the items has a sell price at this hub — a dash, not a 0. */
  sell: number | null;
}

/**
 * Collapses `buildAppraisal`'s totals to the two figures a Compare Hubs row
 * needs. `buildAppraisal` already excludes an unpriced row from a side's
 * total rather than treating it as free, but its total is still `0` for a
 * side nothing priced on — indistinguishable from "everything here is
 * genuinely worth nothing". This turns that case to `null` too, so the whole
 * hub column reads as a dash rather than a misleadingly precise 0.
 */
export function buildHubComparison(
  items: readonly AppraisalItem[],
  pricePercent: number
): HubComparisonTotals {
  const { totals } = buildAppraisal(items, pricePercent);
  return {
    buy: items.some((item) => item.buy !== null) ? totals.buy : null,
    sell: items.some((item) => item.sell !== null) ? totals.sell : null,
  };
}

/** What one item's reprocessing data looks like, resolved from the SDE bake. */
export interface AppraisalReprocessingEntry {
  portionSize: number;
  materials: readonly ReprocessingMaterial[];
}

export interface ComputeAppraisalRefineInput {
  /** Units of the item pasted, refined together the same way `reprocessingYield` batches them. */
  quantity: number;
  /** Undefined when the type carries no reprocessing data at all. */
  reprocessing: AppraisalReprocessingEntry | undefined;
  skills: ReprocessingSkills;
  /** materialTypeId -> ISK a unit at the appraisal's Trade Hub. */
  materialPrices: Readonly<Record<number, number>>;
}

/**
 * The per-row refine comparison: the pasted quantity, refined with the
 * character's own skills at the assumed NPC-station rate, priced at the
 * appraisal's hub — deliberately not the station-priced comparison
 * `orderExits.ts` makes for one open order, since an Appraisal is quoted at a
 * Trade Hub rather than wherever the pasted stock happens to sit.
 *
 * Undefined in, undefined out: a type with no reprocessing data has no
 * comparison to show, which is different from a comparison that resolves to
 * zero (a part-portion quantity — `reprocessingYield`'s own discipline).
 */
export function computeAppraisalRefine({
  quantity,
  reprocessing,
  skills,
  materialPrices,
}: ComputeAppraisalRefineInput): AppraisalRefine | undefined {
  if (!reprocessing) return undefined;
  const efficiency = reprocessingEfficiency(skills);
  const yielded = reprocessingYield({
    portionSize: reprocessing.portionSize,
    materials: reprocessing.materials,
    units: quantity,
    efficiency,
  });
  const value = reprocessingValue(yielded.outputs, materialPrices);
  return {
    valueAtFullPrice: value.total,
    pricedAll: value.pricedAll,
    unitsLeftOver: yielded.unitsLeftOver,
  };
}
