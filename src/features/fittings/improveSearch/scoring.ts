import type { ImproveGoal } from '@/engine/fittings/improve';
import { assumeCharges } from '@/engine/fittings/improve';
import {
  crystalPlan,
  loadCrystals,
  minerWithoutCrystal,
  type CrystalPlan,
} from '@/engine/fittings/improve';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import type { SearchContext } from './context';

export interface Scoring {
  scoredBefore: FittingStats;
  stats: (fitting: Fitting) => Promise<FittingStats>;
  plan: CrystalPlan | null;
}

function minePlan(ctx: SearchContext, own: FittingStats): Promise<CrystalPlan | null> {
  const { request, ports, signal, fitting } = ctx;
  const { catalogue } = request;
  return crystalPlan(
    {
      family: request.config.oreFamily,
      minerTypeIds: own.mining.rows.filter((row) => !row.isDrone).map((row) => row.typeId),
      chargeGroupsOf: (typeId) => {
        const slot = catalogue.rackOf[String(typeId)] as FittingSlotKind | undefined;
        return slot ? ports.chargeGroups(slot, typeId) : [];
      },
      typeIdsInGroup: (group) => catalogue.typeIdsByGroup.get(group) ?? [],
      nameOf: (typeId) => catalogue.types[String(typeId)]?.name,
    },
    async (crystalFor) =>
      (await ports.compare(loadCrystals(fitting, crystalFor), signal)).after.mining.perSecond
  );
}

export async function scoringFor(
  ctx: SearchContext,
  searched: ImproveGoal,
  own: FittingStats
): Promise<Scoring | null> {
  const { request, ports, signal, fitting } = ctx;
  const { chargePlan } = request;
  let scoredBefore = own;
  let load = (variant: Fitting) => assumeCharges(variant, fitting, chargePlan);
  let plan: CrystalPlan | null = null;
  if (searched === 'mining') {
    plan = await minePlan(ctx, own);
    if (signal.aborted) return null;
    const crystalFor = plan?.crystalFor;
    if (crystalFor) {
      load = (variant) => loadCrystals(assumeCharges(variant, fitting, chargePlan), crystalFor);
      scoredBefore = (await ports.compare(load(fitting), signal)).after;
    }
  }
  if (searched !== 'mining' && chargePlan.length > 0)
    scoredBefore = (await ports.compare(load(fitting), signal)).after;
  const stats = async (variant: Fitting) => {
    const after = await ports.stats(load(variant), signal);
    if (plan && minerWithoutCrystal(after.mining.rows, plan.crystalFor))
      throw new Error('A miner takes no crystal of this ore');
    return after;
  };
  return { scoredBefore, stats, plan };
}
