import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { haulingFlags, lotEconomics, type HaulingFlag } from '@/engine/market/haulingMarket';
import { profitableDepth, type TripCandidate } from '@/engine/market/haulingPlan';
import type { TradeHub } from '@/market/hubs';
import type { HaulingScanRow } from './haulingData';

export type HaulingFeesAt = (hub: TradeHub) => AppraisalNetFees;

export type HaulingViewRow = HaulingScanRow & {
  marginPct: number;
  profitPerUnit: number;
  iskPerM3: number;
  price: number;
  flags: HaulingFlag[];
  suggestedUnits: number;
  fees: AppraisalNetFees;
  candidate: TripCandidate;
};

function toCandidate(row: HaulingScanRow, fees: AppraisalNetFees): TripCandidate {
  const base = {
    fees,
    typeId: row.typeId,
    name: row.name,
    unitVolumeM3: row.unitVolumeM3,
    buyLadder: row.buyLadder,
    groupId: row.groupId,
    categoryId: row.categoryId,
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
  feesAt: HaulingFeesAt
): HaulingViewRow[] {
  return rows.map((row) => toViewRow(row, feesAt(row.toHub)));
}

function toViewRow(row: HaulingScanRow, fees: AppraisalNetFees): HaulingViewRow {
  const candidate = toCandidate(row, fees);
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
    fees,
    flags: haulingFlags({
      ladder: row.mode === 'list' ? row.destLadder : [],
      demand: row.mode === 'list' ? row.demand.demand : null,
      marginPct: economics.marginPct,
    }),
    candidate,
  };
}

function capBuyLadder(row: HaulingViewRow, maxUnitPrice: number | null): HaulingViewRow {
  if (maxUnitPrice === null || row.buyLadder.every((level) => level.price <= maxUnitPrice))
    return row;
  return toViewRow(
    { ...row, buyLadder: row.buyLadder.filter((level) => level.price <= maxUnitPrice) },
    row.fees
  );
}

export interface HaulingFilters {
  maxDays: number | null;
  minMarginPct: number;
  steadyOnly: boolean;
  maxUnitPrice: number | null;
}

export interface FilteredHaulingRows {
  shown: HaulingViewRow[];
  hidden: { tooDear: number; thin: number; slow: number; lowMargin: number };
}

export function filterHaulingRows(
  rows: readonly HaulingViewRow[],
  filters: HaulingFilters
): FilteredHaulingRows {
  const shown: HaulingViewRow[] = [];
  const hidden = { tooDear: 0, thin: 0, slow: 0, lowMargin: 0 };
  for (const listed of rows) {
    const unitPrice = listed.buyLadder[0]?.price;
    if (
      filters.maxUnitPrice !== null &&
      unitPrice !== undefined &&
      unitPrice > filters.maxUnitPrice
    ) {
      hidden.tooDear += 1;
      continue;
    }
    const row = capBuyLadder(listed, filters.maxUnitPrice);
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

export function formatDaysToSell(days: number): string {
  return days > 99 ? '99+' : String(Math.max(1, Math.round(days)));
}
