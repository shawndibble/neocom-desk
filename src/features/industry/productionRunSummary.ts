import type {
  ProductionLossRecord,
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  ProductionSaleLinkRecord,
} from '@/db';
import { computeOrderFillQuantity } from '@/engine/industry/orderWatch';
import { realizedProfit, type RealizedProfitResult } from '@/engine/industry/realizedProfit';
import { SKILL_IDS, type SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';

export type ProductionRunStatus = 'new' | 'open' | 'closed';

export interface ProductionRunSummary {
  run: ProductionRunRecord;
  saleLinks: ProductionSaleLinkRecord[];
  orderWatches: (ProductionOrderWatchRecord & { filled: number })[];
  losses: ProductionLossRecord[];
  quantityLost: number;
  profit: RealizedProfitResult;
  quantitySold: number;
  remaining: number;
  status: ProductionRunStatus;
  openInventoryValue: number;
}

export function summarizeProductionRun(
  run: ProductionRunRecord,
  saleLinks: readonly ProductionSaleLinkRecord[],
  orderWatches: readonly ProductionOrderWatchRecord[],
  skills: SkillLevels,
  standing?: ResolvedStandings,
  losses: readonly ProductionLossRecord[] = []
): ProductionRunSummary {
  const runLosses = losses.filter((l) => l.runId === run.id);
  const quantityLost = runLosses.reduce((sum, l) => sum + l.quantity, 0);
  const insurancePayout = runLosses.reduce((sum, l) => sum + l.insurancePayout, 0);
  const runSaleLinks = saleLinks.filter((l) => l.runId === run.id);
  const runOrderWatches = orderWatches
    .filter((w) => w.runId === run.id)
    .map((w) => ({
      ...w,
      filled: computeOrderFillQuantity(w.initialVolumeRemain, w.lastKnownVolumeRemain),
    }));

  const linkedRevenue = runSaleLinks.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const linkedQty = runSaleLinks.reduce((sum, l) => sum + l.quantity, 0);
  const watchFilledQty = runOrderWatches.reduce((sum, w) => sum + w.filled, 0);
  const watchRevenue = runOrderWatches.reduce((sum, w) => sum + w.filled * w.unitPrice, 0);
  const quantitySold = linkedQty + watchFilledQty;

  const profit = realizedProfit({
    materialCost: run.materialCost,
    jobFee: run.jobFee,
    quantitySold,
    grossRevenue: linkedRevenue + watchRevenue,
    accountingLevel: skills[SKILL_IDS.accounting] ?? 0,
    brokerFeeableRevenue: watchRevenue,
    brokerRelationsLevel: skills[SKILL_IDS.brokerRelations] ?? 0,
    standing,
    insurancePayout,
  });

  const remaining = Math.max(0, run.quantity - quantitySold - quantityLost);
  const costPerUnit = run.quantity > 0 ? run.totalCost / run.quantity : 0;
  const status: ProductionRunStatus =
    quantitySold + quantityLost === 0 ? 'new' : remaining === 0 ? 'closed' : 'open';

  return {
    run,
    saleLinks: runSaleLinks,
    orderWatches: runOrderWatches,
    losses: runLosses,
    quantityLost,
    profit,
    quantitySold,
    remaining,
    status,
    openInventoryValue: remaining * costPerUnit,
  };
}

export interface ProductionRunsRollup {
  count: number;
  realizedProfit: number;
  openCount: number;
}

export function rollupProductionRuns(
  rows: readonly Pick<ProductionRunSummary, 'profit' | 'status'>[]
): ProductionRunsRollup {
  return {
    count: rows.length,
    realizedProfit: rows.reduce((sum, row) => sum + row.profit.profit, 0),
    openCount: rows.filter((row) => row.status !== 'closed').length,
  };
}
