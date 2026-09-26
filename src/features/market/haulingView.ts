/**
 * The Hauling Opportunities table's rows: a scan's items at this Character's
 * own fee rates, with the two default filters applied and counted. Pure —
 * `haulingData.ts` fetches, `engine/market/haulingMarket` prices, and this
 * only joins the two for the panel.
 */
import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { haulingFlags, lotEconomics, type HaulingFlag } from '@/engine/market/haulingMarket';
import type { TripCandidate } from '@/engine/market/haulingPlan';
import type { HaulingScanRow } from './haulingData';

export interface HaulingViewRow extends HaulingScanRow {
  /** Margin after fees on the suggested load, percent of the ISK spent. */
  marginPct: number;
  /** Profit per unit on that load. */
  profitPerUnit: number;
  flags: HaulingFlag[];
  /** What the trip planner sizes. */
  candidate: TripCandidate;
}

export function toViewRows(
  rows: readonly HaulingScanRow[],
  fees: AppraisalNetFees
): HaulingViewRow[] {
  return rows.map((row) => {
    const economics = lotEconomics({
      buyLadder: row.buyLadder,
      expectedPrice: row.sale.price,
      quantity: row.sale.demandCapUnits,
      fees,
    });
    return {
      ...row,
      marginPct: economics.marginPct,
      profitPerUnit: economics.filled > 0 ? economics.profit / economics.filled : 0,
      flags: haulingFlags({
        ladder: row.destLadder,
        demand: row.demand.demand,
        marginPct: economics.marginPct,
      }),
      candidate: {
        typeId: row.typeId,
        name: row.name,
        unitVolumeM3: row.unitVolumeM3,
        buyLadder: row.buyLadder,
        expectedPrice: row.sale.price,
        demandCapUnits: row.sale.demandCapUnits,
      },
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
    if (filters.steadyOnly && row.demand.demand === 'rarely') hidden.thin += 1;
    else if (filters.maxDays !== null && row.sale.daysToSell > filters.maxDays) hidden.slow += 1;
    else if (row.marginPct < filters.minMarginPct) hidden.lowMargin += 1;
    else shown.push(row);
  }
  shown.sort((a, b) => b.marginPct - a.marginPct);
  return { shown, hidden };
}
