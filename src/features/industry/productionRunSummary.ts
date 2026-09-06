/**
 * Shared per-run summary math for the Production Log (issue #525) — used by
 * both `ProductionRunsPanel` (one Build Plan's own runs) and
 * `ProductionLogPanel` (the cross-plan aggregate), so the two views can never
 * disagree about what "sold" or "closed" means for the same run.
 */
import type {
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  ProductionSaleLinkRecord,
} from '@/db';
import { computeOrderFillQuantity } from '@/engine/industry/orderWatch';
import { realizedProfit, type RealizedProfitResult } from '@/engine/industry/realizedProfit';
import { SKILL_IDS, type SkillLevels } from '@/engine/industry/types';

export type ProductionRunStatus = 'new' | 'open' | 'closed';

export interface ProductionRunSummary {
  run: ProductionRunRecord;
  saleLinks: ProductionSaleLinkRecord[];
  orderWatches: (ProductionOrderWatchRecord & { filled: number })[];
  profit: RealizedProfitResult;
  quantitySold: number;
  /** `run.quantity - quantitySold`, floored at zero. */
  remaining: number;
  /** `'new'` — nothing sold yet. `'open'` — partially sold. `'closed'` — fully sold. */
  status: ProductionRunStatus;
  /** Cost-basis value (at this run's own cost/unit) of the units not yet sold. */
  openInventoryValue: number;
}

/**
 * Summarizes one run against the full set of the character's sale links and
 * order watches — the caller passes every row it has loaded (not
 * pre-filtered to this run) and this does the filtering, so a caller with
 * several runs in view only needs one `useLiveQuery` per table.
 */
export function summarizeProductionRun(
  run: ProductionRunRecord,
  saleLinks: readonly ProductionSaleLinkRecord[],
  orderWatches: readonly ProductionOrderWatchRecord[],
  skills: SkillLevels
): ProductionRunSummary {
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
  });

  const remaining = Math.max(0, run.quantity - quantitySold);
  const costPerUnit = run.quantity > 0 ? run.totalCost / run.quantity : 0;
  const status: ProductionRunStatus =
    quantitySold === 0 ? 'new' : remaining === 0 ? 'closed' : 'open';

  return {
    run,
    saleLinks: runSaleLinks,
    orderWatches: runOrderWatches,
    profit,
    quantitySold,
    remaining,
    status,
    openInventoryValue: remaining * costPerUnit,
  };
}
