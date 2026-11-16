/**
 * How an Improve search scores a fit: empty guns and launchers loaded with the
 * best charge, and for Mine more every miner loaded with the picked ore's
 * best crystal, the baseline's too, so every row compares on the same load.
 */
import type { ImproveGoal } from '@/engine/fittings/improve';
import { assumeCharges } from '@/engine/fittings/improveCharges';
import {
  crystalPlan,
  loadCrystals,
  minerWithoutCrystal,
  type CrystalPlan,
} from '@/engine/fittings/improveMining';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import type { SearchContext } from './context';

export interface Scoring {
  /** The open Fitting as every row is compared against: loaded as the rows are. */
  scoredBefore: FittingStats;
  /** A variant's stats, loaded the same way; rejects for a miner left without the ore's crystal. */
  stats: (fitting: Fitting) => Promise<FittingStats>;
  /** Mine more's crystal plan; null for other goals or when no miner takes the ore's crystals. */
  plan: CrystalPlan | null;
}

/** Mine more's plan for the open Fitting: the crystal key that mines the most, for every miner type. */
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

/** Null when cancelled while the crystals were being tried. */
export async function scoringFor(
  ctx: SearchContext,
  searched: ImproveGoal,
  own: FittingStats
): Promise<Scoring | null> {
  const { request, ports, signal, fitting } = ctx;
  const { chargePlan } = request;
  let scoredBefore = own;
  // Empty guns and launchers are scored loaded with the best charge, so an unarmed-looking fit isn't stripped of support.
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
    // A miner with no crystal of the ore would mine another ore's m³/s: left out, not compared.
    if (plan && minerWithoutCrystal(after.mining.rows, plan.crystalFor))
      throw new Error('A miner takes no crystal of this ore');
    return after;
  };
  return { scoredBefore, stats, plan };
}
