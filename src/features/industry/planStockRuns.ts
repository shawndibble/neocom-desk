import type { BuildPlanRecord } from '@/db';
import { withoutOwnedQuantities } from '@/engine/industry/materialResolution';
import { maxRunsFromStock, type MaxRunsFromStock } from '@/engine/industry/stockRuns';
import { MAX_JOB_RUNS } from '@/engine/industry/types';
import { materialTableRows } from './subBuildPlan';
import type { UseResolvedPlanResult } from './useResolvedPlan';

interface PlanStockRunsInput {
  plan: BuildPlanRecord;
  resolveQuantitiesAt: UseResolvedPlanResult['resolveQuantitiesAt'];
  /** The Owned-Stock Offer's quantity per type (`offerableStock`). */
  availableFor: (typeID: number) => number;
}

/**
 * The most runs this plan's owned stock covers, over the rows the Materials
 * table shows (sub-build inputs included, the Blueprint Acquisition row not:
 * it is never stock). Each trial resolves the plan as if it owned nothing, so
 * a trial's rows are what the run count needs, whatever Haves are typed now.
 * `null` when the plan has no rows to cover or nothing is owned of any.
 */
export function planStockRuns({
  plan,
  resolveQuantitiesAt,
  availableFor,
}: PlanStockRunsInput): MaxRunsFromStock | null {
  const sourcing = withoutOwnedQuantities(plan.materialSourcing);
  const rowsAt = (runs: number) => {
    const { result } = resolveQuantitiesAt({ ...plan, runs, materialSourcing: sourcing });
    return result
      ? materialTableRows(result.materials).filter((row) => row.acquisitionTier === undefined)
      : [];
  };
  const rows = rowsAt(1);
  if (rows.length === 0 || !rows.some((row) => availableFor(row.typeID) > 0)) return null;
  return maxRunsFromStock({ rowsAt, availableFor, maxRuns: MAX_JOB_RUNS });
}
