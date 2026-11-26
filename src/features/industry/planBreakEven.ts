import type { BuildPlanRecord } from '@/db';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { breakEvenRuns } from '@/engine/industry/breakEvenRuns';
import { planOwnedStockSale, type LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { ProfitBasis } from '@/engine/industry/profitBasis';
import type { MarketSnapshot } from './marketData';
import type { pricingSourcesForHub } from './buildPlanPricingInputs';
import type { useResolvedPlan } from './useResolvedPlan';

interface PlanBreakEvenInput {
  plan: BuildPlanRecord;
  resolveAt: ReturnType<typeof useResolvedPlan>['resolveAt'];
  heroBasis: ProfitBasis | null;
  snapshot: MarketSnapshot | null;
  saleBasis: LiquidationBasis;
  skills: CharacterModifiers['skills'];
  standing: ReturnType<typeof pricingSourcesForHub>['standing'];
}

export function planBreakEvenRuns({
  plan,
  resolveAt,
  heroBasis,
  snapshot,
  saleBasis,
  skills,
  standing,
}: PlanBreakEvenInput): number | null {
  return breakEvenRuns((trial) => {
    const trialResult = resolveAt({ ...plan, runs: trial }).result;
    if (!trialResult || trialResult.profit === null) return null;
    if (heroBasis !== 'sellValue' || !snapshot) return trialResult.profit;
    const sale = planOwnedStockSale(trialResult.materials, snapshot, saleBasis, skills, standing);
    if (sale.unpriced.length > 0) return trialResult.profit;
    return trialResult.profit - sale.net;
  }, plan.runs);
}
