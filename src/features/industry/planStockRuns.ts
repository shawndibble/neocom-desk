import type { BuildPlanRecord } from '@/db';
import { withoutOwnedQuantities } from '@/engine/industry/materialResolution';
import { maxRunsFromStock, type MaxRunsFromStock } from '@/engine/industry/stockRuns';
import { MAX_JOB_RUNS } from '@/engine/industry/types';
import { materialTableRows } from './subBuildPlan';
import type { UseResolvedPlanResult } from './useResolvedPlan';

interface PlanStockRunsInput {
  plan: BuildPlanRecord;
  resolveQuantitiesAt: UseResolvedPlanResult['resolveQuantitiesAt'];
  availableFor: (typeID: number) => number;
}

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
