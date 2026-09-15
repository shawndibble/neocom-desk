/**
 * Small pure helpers shared by `OpportunitiesPanel` (the desktop table) and
 * `MobileOpportunityList` (the phone ranked list) — its own module rather
 * than exported from either component file, so pulling one into the other
 * doesn't mix plain functions/constants into a component file (breaks Fast
 * Refresh for both).
 */
import type { StatChipTone } from '@/components/ui';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { OpportunityRow } from './opportunities';

export const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

export function unitCount(row: OpportunityRow): number {
  const quantity = row.candidate.catalogEntry.blueprint.products[0]?.quantity ?? 1;
  return quantity * row.candidate.blueprint.runs;
}

export function unitMargin(row: OpportunityRow): number | null {
  if (row.result.profit === null) return null;
  const units = unitCount(row);
  return units > 0 ? row.result.profit / units : null;
}
