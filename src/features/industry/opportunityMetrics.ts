import type { StatChipTone } from '@/components/ui';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { TFunction } from 'i18next';
import {
  isReaction,
  pricedRuns,
  type OpportunityCandidate,
  type OpportunityRow,
} from './opportunities';
import type { OpportunitiesActivityFilter } from './opportunitiesUrl';

export const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

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

export const MOSTLY_COVERED_PCT = 75;

export type StockFilter = 'any' | 'mostly' | 'full';

export interface StockCoverage {
  coveredPct: number;
  stillToBuyIsk: number;
}

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

export function matchesActivityFilter(
  row: OpportunityRow,
  filter: OpportunitiesActivityFilter
): boolean {
  return filter === 'all' || row.candidate.catalogEntry.blueprint.activity === filter;
}

export function activityFilterOptions(t: TFunction) {
  return [
    { value: 'all' as const, label: t('industry.ownedBlueprintsAll') },
    { value: 'manufacturing' as const, label: t('industry.ownedBlueprintsActivity.manufacturing') },
    { value: 'reaction' as const, label: t('industry.ownedBlueprintsActivity.reaction') },
  ];
}

export function blueprintKindKey(candidate: OpportunityCandidate): string {
  if (isReaction(candidate)) return 'industry.ownedBlueprintsActivity.reaction';
  return candidate.blueprint.runs === -1 ? 'industry.bpo' : 'industry.bpc';
}

export function matchesStockFilter(row: OpportunityRow, filter: StockFilter): boolean {
  if (filter === 'any') return true;
  const coverage = stockCoverage(row);
  if (!coverage) return false;
  return filter === 'full'
    ? coverage.stillToBuyIsk < 0.005
    : coverage.coveredPct >= MOSTLY_COVERED_PCT;
}
