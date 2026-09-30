/**
 * The Hauling Opportunities table's rows: a scan's items at this Character's
 * own fee rates, with the two default filters applied and counted. Pure —
 * `haulingData.ts` fetches, `engine/market/haulingMarket` prices, and this
 * only joins the two for the panel.
 */
import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { haulingFlags, lotEconomics, type HaulingFlag } from '@/engine/market/haulingMarket';
import { profitableDepth, type TripCandidate } from '@/engine/market/haulingPlan';
import type { HaulingScanRow } from './haulingData';

/** A scan row priced at this Character's fees. An intersection, not an `interface`: the scan row is a union over the two modes. */
export type HaulingViewRow = HaulingScanRow & {
  /** Margin after fees on the suggested load, percent of the ISK spent. */
  marginPct: number;
  /** Profit per unit on that load. */
  profitPerUnit: number;
  /** Profit per m³ of hold on that load (ISK/m³): what a full hold of it earns per cubic metre. */
  iskPerM3: number;
  /**
   * The sell price the table shows: the Expected Sell Price when listing, or
   * the average price the destination's buy orders actually pay for the
   * suggested load when selling into them (their best bid when none is profitable).
   */
  price: number;
  flags: HaulingFlag[];
  /**
   * Units the margin is worked on. Listing: a week of sales, capped at what is
   * profitable to buy. Selling into buy orders: the depth both books stay
   * profitable to. The plan sizes from the same figure.
   */
  suggestedUnits: number;
  /** What the trip planner sizes. */
  candidate: TripCandidate;
};

function toCandidate(row: HaulingScanRow): TripCandidate {
  const base = {
    typeId: row.typeId,
    name: row.name,
    unitVolumeM3: row.unitVolumeM3,
    buyLadder: row.buyLadder,
  };
  return row.mode === 'instant'
    ? {
        ...base,
        expectedPrice: row.destBuyLadder[0]?.price ?? 0,
        demandCapUnits: null,
        destBuyLadder: row.destBuyLadder,
      }
    : { ...base, expectedPrice: row.sale.price, demandCapUnits: row.sale.demandCapUnits };
}

export function toViewRows(
  rows: readonly HaulingScanRow[],
  fees: AppraisalNetFees
): HaulingViewRow[] {
  return rows.map((row) => {
    const candidate = toCandidate(row);
    const depth = profitableDepth(candidate, fees);
    const suggestedUnits =
      candidate.demandCapUnits === null ? depth : Math.min(candidate.demandCapUnits, depth);
    const economics = lotEconomics({
      buyLadder: row.buyLadder,
      expectedPrice: candidate.expectedPrice,
      quantity: suggestedUnits,
      fees,
      destBuyLadder: candidate.destBuyLadder,
    });
    const profitPerUnit = economics.filled > 0 ? economics.profit / economics.filled : 0;
    const price =
      row.mode === 'instant'
        ? economics.filled > 0
          ? economics.revenue / economics.filled
          : candidate.expectedPrice
        : row.sale.price;
    return {
      ...row,
      suggestedUnits,
      marginPct: economics.marginPct,
      profitPerUnit,
      iskPerM3: profitPerUnit / row.unitVolumeM3,
      price,
      flags: haulingFlags({
        ladder: row.mode === 'list' ? row.destLadder : [],
        demand: row.mode === 'list' ? row.demand.demand : null,
        marginPct: economics.marginPct,
      }),
      candidate,
    };
  });
}

export interface HaulingFilters {
  /** Longest days-to-sell a row may have; null shows any. */
  maxDays: number | null;
  /** Margin after fees, percent, a row must reach. */
  minMarginPct: number;
  /** Hide rows whose demand is "rarely sells". */
  steadyOnly: boolean;
}

export interface FilteredHaulingRows {
  shown: HaulingViewRow[];
  /** Why rows are missing, so the footer can name them instead of dropping them silently. A row failing several counts under the first that applies: thin, then slow. */
  hidden: { thin: number; slow: number; lowMargin: number };
}

/** Best margin first. */
export function filterHaulingRows(
  rows: readonly HaulingViewRow[],
  filters: HaulingFilters
): FilteredHaulingRows {
  const shown: HaulingViewRow[] = [];
  const hidden = { thin: 0, slow: 0, lowMargin: 0 };
  for (const row of rows) {
    // Demand and Days to Sell are not read for an instant sale: only the margin filter applies.
    if (row.mode === 'list' && filters.steadyOnly && row.demand.demand === 'rarely')
      hidden.thin += 1;
    else if (
      row.mode === 'list' &&
      filters.maxDays !== null &&
      row.sale.daysToSell > filters.maxDays
    )
      hidden.slow += 1;
    else if (row.marginPct < filters.minMarginPct) hidden.lowMargin += 1;
    else shown.push(row);
  }
  shown.sort((a, b) => b.marginPct - a.marginPct);
  return { shown, hidden };
}

/** Days to sell as a column shows it: whole days, at least one, capped so an outlier cannot widen the column. */
export function formatDaysToSell(days: number): string {
  return days > 99 ? '99+' : String(Math.max(1, Math.round(days)));
}
