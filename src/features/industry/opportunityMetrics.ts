/**
 * Small pure helpers shared by `OpportunitiesPanel` (the desktop table) and
 * `MobileOpportunityList` (the phone ranked list) — its own module rather
 * than exported from either component file, so pulling one into the other
 * doesn't mix plain functions/constants into a component file (breaks Fast
 * Refresh for both).
 */
import type { StatChipTone } from '@/components/ui';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import { pricedRuns, type OpportunityRow } from './opportunities';

export const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

/** Sort rank for `OrderDepthLevel` — an enum, not an alphabetical string. */
export const ORDER_DEPTH_RANK: Record<OrderDepthLevel, number> = {
  deep: 3,
  moderate: 2,
  thin: 1,
  unknown: 0,
};

export function unitCount(row: OpportunityRow): number {
  const quantity = row.candidate.catalogEntry.blueprint.products[0]?.quantity ?? 1;
  return quantity * pricedRuns(row.candidate.blueprint);
}

export function unitMargin(row: OpportunityRow): number | null {
  if (row.result.profit === null) return null;
  const units = unitCount(row);
  return units > 0 ? row.result.profit / units : null;
}

/** Share of material cost (at the row's own pricing) a row's owned stock must cover for "mostly". */
export const MOSTLY_COVERED_PCT = 75;

export type StockFilter = 'any' | 'mostly' | 'full';

export interface StockCoverage {
  /** 0–100: owned material value over total material value. */
  coveredPct: number;
  /** ISK left to buy after owned stock is claimed. */
  stillToBuyIsk: number;
}

/**
 * How much of a row's top-level materials owned stock covers, valued at the
 * row's own unit prices. Null when any material is unpriced (a partial
 * percentage would mislead) or the row has no materials.
 */
export function stockCoverage(row: OpportunityRow): StockCoverage | null {
  const materials = row.result.materials;
  if (materials.length === 0) return null;
  let ownedValue = 0;
  let stillToBuyIsk = 0;
  for (const m of materials) {
    if (m.unitPrice === null || m.unpriced) return null;
    ownedValue += m.ownedQuantity * m.unitPrice;
    stillToBuyIsk += m.lineCost;
  }
  const total = ownedValue + stillToBuyIsk;
  if (total <= 0) return null;
  return { coveredPct: (ownedValue / total) * 100, stillToBuyIsk };
}

export function matchesStockFilter(row: OpportunityRow, filter: StockFilter): boolean {
  if (filter === 'any') return true;
  const coverage = stockCoverage(row);
  if (!coverage) return false;
  return filter === 'full'
    ? coverage.stillToBuyIsk === 0
    : coverage.coveredPct >= MOSTLY_COVERED_PCT;
}
