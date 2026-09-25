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
 *
 * LP store acquisition rides alongside the same way: a faction/navy item
 * with no blueprint at all (the Astero, say) still often turns up in an NPC
 * corp's LP store, which is a second acquisition path beyond the market's
 * sell side `sellTotal` already prices. `lpOption` on `AppraisalItem` (from
 * `features/market/appraisalLpAcquisition.ts`, which resolves which corp
 * offers it and fetches the LP balance) is never scaled by Price Percent —
 * it is a fixed NPC price, not a market order someone is negotiating a
 * fraction of — and only ever competes with `sellTotal`, never `buyTotal`:
 * redeeming an offer is how a pilot *acquires* the item, not how they
 * dispose of one they already have.
 */
import {
  reprocessingValue,
  reprocessingYield,
  type ReprocessingMaterial,
} from '@/engine/industry/reprocessing';
import { refiningEfficiency, type CharacterModifiers } from '@/engine/industry/characterModifiers';
import { brokerFee, brokerFeePct, salesTax, salesTaxPct } from '@/engine/industry/fees';
import type { AppraisalLpOption } from '@/engine/market/lpAcquisition';
import { undercutPrice } from '@/engine/market/priceTick';
import type { ResolvedStandings } from '@/engine/market/standings';

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
  /** Undefined when nothing the character holds LP with sells this item. */
  lpOption?: AppraisalLpOption;
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
  /** Undefined when nothing the character holds LP with sells this item. */
  lpCorporationId?: number;
  lpCorpName?: string;
  lpCost?: number;
  lpIskCost?: number;
  lpAffordable?: boolean;
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
  /**
   * `sellTotal`, or the cheaper affordable `lpIskCost` where one exists —
   * "the total" a pilot actually pays to acquire everything pasted, LP store
   * included. Equal to `sell` whenever no row has a cheaper affordable LP
   * option, so a paste with nothing LP-redeemable reads exactly as before.
   */
  cheapestBuy: number;
  /** Rows whose cheapest-known acquisition path is redeeming an LP offer. */
  cheapestBuyViaLp: number;
}

export interface Appraisal {
  rows: AppraisalRow[];
  totals: AppraisalTotals;
  /**
   * The same items, unscaled — `appraisalNet` reads these rather than
   * `AppraisalRow`'s percent-scaled `buyEach`/`sellEach`, per the net-of-fees
   * figures always being quoted at 100% of market
   * (`20260924-010954-appraisal-shows-net-of-fees-totals-at-100.md`). Same
   * order as `rows`, one per row.
   */
  items: readonly AppraisalItem[];
}

function scale(price: number | null, percent: number): number | null {
  return price === null ? null : (price * percent) / 100;
}

/**
 * Does refining this row beat selling it as is?
 *
 * "Sell-as-is" is `buyTotal` in this engine's own vocabulary — what the list
 * fetches sold into buy orders right now (`market.appraisal.buyTotalHelp`) —
 * so that is what the refine-then-sell comparison is judged against, the same
 * axis `orderExits.ts` prices its own refine exit on.
 *
 * The refine side is what the player actually ends up holding: the whole
 * batches refined, **plus** the units that could not fill a batch, which are
 * still there to sell at the same price the sell side quotes. Comparing the
 * refine total alone against the full quantity charged the refine path for
 * units it never consumed, and recommended the worse option across a
 * measured band of ordinary ore (issue #1048). Both sides are already scaled
 * by the appraisal's Price Percent, so they stay on one axis.
 *
 * Strictly greater, because a tie is not a win: a quantity below one whole
 * batch refines into nothing, leaving the leftover equal to the whole paste,
 * and both paths come to exactly the same ISK. That case must read as sell.
 *
 * False whenever no comparison exists — no reprocessing data, or nobody
 * buying. `buyEach` prices both the sell side and the leftover, so a row with
 * no buy price cannot value either; answering false leaves the leftover
 * unpriced rather than silently free.
 */
export function refineBeatsSellAsIs(row: AppraisalRow): boolean {
  if (row.refineTotal === undefined || row.buyEach === null || row.buyTotal === null) return false;
  // Set together with `refineTotal` in `buildAppraisal`, which the types do
  // not say; `?? 0` reads a row with no leftover, the same as none recorded.
  const leftOverValue = (row.refineUnitsLeftOver ?? 0) * row.buyEach;
  return row.refineTotal + leftOverValue > row.buyTotal;
}

/**
 * Does redeeming this row's LP offer beat buying it off the market?
 *
 * Only ever true against an *affordable* offer — a cheaper option the
 * character lacks the LP for is real information (`row.lpIskCost` still
 * carries it, for display), but it does not win a comparison about what the
 * pilot can actually do today, and `cheapestBuy` must not credit a total the
 * character cannot pay. A market row with no sell price at all (`sellTotal
 * === null`) loses to any affordable offer, the same "an unpriced side must
 * not silently read as free, but it also must not block a real number from
 * winning" rule `unpricedLeafTypeIds` applies on the build side.
 */
export function lpBeatsMarket(row: AppraisalRow): boolean {
  if (row.lpIskCost === undefined || row.lpAffordable !== true) return false;
  return row.sellTotal === null || row.lpIskCost < row.sellTotal;
}

/** Prices every item at `pricePercent` of market and totals both sides. */
export function buildAppraisal(items: readonly AppraisalItem[], pricePercent: number): Appraisal {
  const rows: AppraisalRow[] = [];
  let buy = 0;
  let sell = 0;
  let unpricedRows = 0;
  let refine = 0;
  let refineUnpricedRows = 0;
  let cheapestBuy = 0;
  let cheapestBuyViaLp = 0;

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

    const row: AppraisalRow = {
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
      lpCorporationId: item.lpOption?.corporationId,
      lpCorpName: item.lpOption?.corpName,
      lpCost: item.lpOption?.lpCost,
      lpIskCost: item.lpOption?.iskCost,
      lpAffordable: item.lpOption?.affordableLp,
    };

    const useLp = lpBeatsMarket(row);
    const rowCheapest = useLp ? (row.lpIskCost ?? null) : sellTotal;
    if (rowCheapest !== null) cheapestBuy += rowCheapest;
    if (useLp) cheapestBuyViaLp += 1;

    rows.push(row);
  }

  return {
    rows,
    totals: {
      buy,
      sell,
      spread: sell - buy,
      unpricedRows,
      refine,
      refineUnpricedRows,
      cheapestBuy,
      cheapestBuyViaLp,
    },
    items,
  };
}

/** The character inputs `appraisalNet` needs, resolved by the caller from Character Modifiers and hub standings. */
export interface AppraisalNetFees {
  accountingLevel: number;
  brokerRelationsLevel: number;
  /** The character's standing toward the trade hub's NPC station owner. */
  standing: ResolvedStandings;
}

/** What actually reaches the wallet, at 100% of market — see `Appraisal.items`'s doc. */
export interface AppraisalNetTotals {
  /** Selling every priced item into buy orders now: raw buy total minus sales tax. */
  instantNet: number;
  /**
   * Listing every priced item one legal tick under its best sell: that
   * undercut total minus sales tax minus broker fee (100 ISK minimum, once
   * per item — one pasted type is one listing, the same "per stack listed"
   * rule `ownedStockSale` applies to a material).
   */
  listNet: number;
  /** The character's own sales-tax rate, percent — for the chip tooltip. */
  salesTaxPct: number;
  /** The character's own broker-fee rate at this hub, percent — for the chip tooltip. */
  brokerFeePct: number;
}

/** The sell-order price that beats every seller at the hub, for one pasted item. */
export interface AppraisalUndercut {
  /** One legal tick under the cheapest sell order — what to type into EVE's price field. */
  price: number;
  /**
   * True when that price is no better than the best buy order: selling into
   * the buy order instead pays the same or more, today, with no broker fee.
   */
  atOrBelowBuy: boolean;
}

/**
 * The Appraisal's Undercut view: what to list each pasted item at so it
 * sits cheapest at the hub. Reads the unscaled `AppraisalItem`, never a
 * Price-Percent-scaled row — the price is a real order being beaten, not a
 * negotiated fraction of one — and is the same price `appraisalNet`'s
 * `listNet` is built on, so the column and the chip always agree.
 *
 * Null when nobody is selling (nothing to undercut) or the cheapest seller
 * already sits on the 0.01 ISK floor (no legal price below it).
 */
export function appraisalUndercut(
  item: Pick<AppraisalItem, 'buy' | 'sell'>
): AppraisalUndercut | null {
  const price = item.sell === null ? null : undercutPrice(item.sell);
  if (price === null) return null;
  return { price, atOrBelowBuy: item.buy !== null && price <= item.buy };
}

/**
 * Net-of-fees totals for the two ways to sell what was pasted, always at
 * 100% of market regardless of the appraisal's own Price Percent — reads
 * `AppraisalItem.buy`/`.sell` (unscaled) via `Appraisal.items`, never the
 * `AppraisalRow`'s own percent-scaled `buyEach`/`sellEach`. An item missing
 * the relevant price is excluded from that side's net only, the same "an
 * unpriced side stays out of a total, never free" rule `buildAppraisal`
 * itself applies.
 */
export function appraisalNet(
  items: readonly AppraisalItem[],
  { accountingLevel, brokerRelationsLevel, standing }: AppraisalNetFees
): AppraisalNetTotals {
  let instantNet = 0;
  let listNet = 0;

  for (const item of items) {
    if (item.buy !== null) {
      const buyTotal = item.buy * item.quantity;
      instantNet += buyTotal - salesTax(buyTotal, accountingLevel);
    }

    const undercut = appraisalUndercut(item);
    if (undercut !== null) {
      const listValue = undercut.price * item.quantity;
      const fee = brokerFee(
        listValue,
        brokerRelationsLevel,
        standing.factionStanding,
        standing.corpStanding
      );
      listNet += listValue - salesTax(listValue, accountingLevel) - fee;
    }
  }

  return {
    instantNet,
    listNet,
    salesTaxPct: salesTaxPct(accountingLevel),
    brokerFeePct: brokerFeePct(
      brokerRelationsLevel,
      standing.factionStanding,
      standing.corpStanding
    ),
  };
}

/** One Compare Set item's trade margin at the character's own fee rates — see `compareMargin`. */
export interface CompareMargin {
  /** Best sell minus best buy, ISK; null when either side has no order. */
  spread: number | null;
  /** The spread as a percentage of the best buy (the ISK tied up buying); null with no spread or a zero buy. */
  spreadPct: number | null;
  /**
   * The spread left after buying at the best buy and selling at the best sell
   * with orders of your own: broker fee on both orders (100 ISK minimum each,
   * one unit) plus sales tax on the sell. Uses the same `brokerFee`/`salesTax`
   * rates as `appraisalNet`, so the two surfaces agree.
   */
  afterFees: number | null;
}

/** Spread, spread %, and spread after fees for one unit bought at `bestBuy` and sold at `bestSell`. */
export function compareMargin(
  bestSell: number | null,
  bestBuy: number | null,
  { accountingLevel, brokerRelationsLevel, standing }: AppraisalNetFees
): CompareMargin {
  if (bestSell === null || bestBuy === null) {
    return { spread: null, spreadPct: null, afterFees: null };
  }
  const spread = bestSell - bestBuy;
  const broker = (value: number) =>
    brokerFee(value, brokerRelationsLevel, standing.factionStanding, standing.corpStanding);
  return {
    spread,
    spreadPct: bestBuy > 0 ? (spread / bestBuy) * 100 : null,
    afterFees: spread - salesTax(bestSell, accountingLevel) - broker(bestSell) - broker(bestBuy),
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
  /** The SDE's specialisation skill; absent = scrap, refined under Scrapmetal Processing only (issues #1058, #1226). */
  specialisationSkillId?: number;
}

export interface ComputeAppraisalRefineInput {
  /** Units of the item pasted, refined together the same way `reprocessingYield` batches them. */
  quantity: number;
  /** Undefined when the type carries no reprocessing data at all. */
  reprocessing: AppraisalReprocessingEntry | undefined;
  modifiers: CharacterModifiers;
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
  modifiers,
  materialPrices,
}: ComputeAppraisalRefineInput): AppraisalRefine | undefined {
  if (!reprocessing) return undefined;
  const efficiency = refiningEfficiency(modifiers, reprocessing.specialisationSkillId);
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
